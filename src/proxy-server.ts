import axios, { AxiosError, AxiosRequestConfig } from "axios";
import {
  IncomingMessage as Req,
  ServerResponse as Res,
  IncomingHttpHeaders,
  createServer,
  Server as HttpServer,
} from "http";
import { clone } from "remeda";
import { print, printError, printLimit, printNoMatch } from "./print";
import { ResponseCacheConnector } from "./response-cache";

export type HttpApiProxyServerSettings = {
  find?: string;
  proxyBehavior?: ProxyBehavior;
  hideErrors?: boolean;
  responsesToLog?: RequestId[];
  sourceHost: string | "www.example.com";
  sourcePort: 443 | number;
  proxyPort: 80 | number;
};
type GraphQLCompatibleResponse = { errors?: { message: string }[] };
type ResponseBody = (Record<string, unknown> & GraphQLCompatibleResponse) | any;
const requestIdPrefix = "responseFor";
type RequestId = `responseFor${string}`;
type ProxyResponse = {
  body: ResponseBody;
  status: number;
};
type ProxyResponses = Record<RequestId, ProxyResponse>;
type MatchPaths = { value: string; path: string };
type ProxyBehavior =
  | "SAVE_RESPONSES_FOR_NEW_QUERIES" // Default
  | "RELOAD_RESPONSES_WITH_ERRORS"
  | "NO_REQUEST_FORWARDING" // Just use the local response files AND return errors in case there is no fitting response file
  | "FORCE_UPDATE_ALL";
const defaultProxyBehavior = "SAVE_RESPONSES_FOR_NEW_QUERIES";
// TODO THINK ABOUT: putting the Options above (along with find from Settings) into separate yarn commands (and maybe own files)

// TODO move into class
export const generateResponseOverwriteCode = (
  req: Req,
  potentialPathsForChanges: MatchPaths[],
  searchValue: string,
  filePath: string
) => {
  const cacheDirPath = ["put", "your", "path", "here"];
  const requestId = requestToId(req);
  // TODO update code
  return `You can change values containing "${searchValue}" as follows:

    import ${requestId} from '${filePath}'

    ${potentialPathsForChanges
      .map(({ path, value }) => `${requestId}${path} = ${value}\n`)
      .join("    ")}

    // Use the custom values like this:
    const proxyServer = new HttpApiProxyServer({
      cacheDirPath: ${JSON.stringify(cacheDirPath)},
      overwrites: {${requestId}},
    })

    // Do not forget to run proxyServer.start() and proxyServer.stop() to use the proxy
    `;
};

// TODO move into class (all error checkers)
const isErrorStatus = (status: number) => status !== 200;
const isGraphqlError = (body: ResponseBody) => body?.errors !== undefined;
export const hasError = (resp: ProxyResponse) =>
  isGraphqlError(resp.body) || isErrorStatus(resp.status);

// TODO move into class
export const printErrors = (
  response: ProxyResponse,
  settings: HttpApiProxyServerSettings | undefined,
  filePath: string
) => {
  const stat = response.status.toString();
  if (!settings?.hideErrors && hasError(response)) {
    if (response.body.errors)
      response.body.errors.forEach(({ message }: any) =>
        printError(stat, message, filePath)
      );
    else printError(stat, "Server Error", filePath);
  }
};

// TODO move into class
export const requestToId = (req: Req): RequestId => {
  if (!req.url) {
    throw new Error("[requestToId] Cannot handle a request with missing URL");
  }

  return (requestIdPrefix +
    Array.from(req.url)
      .reduce((hash, char) => 0 | (31 * hash + char.charCodeAt(0)), 0)
      .toString()
      .replace("-", "0")) as RequestId; // because '-' would cause some problems in the code
};

export const isNumberString = (str: string) =>
  !isNaN(str as unknown as number) && !isNaN(parseFloat(str));

export const findObjectPaths = (
  obj: ResponseBody,
  search: string
): MatchPaths[] => {
  const paths: MatchPaths[] = [];
  const searchHelper = (currentObj: ResponseBody, currentPath: string) => {
    for (const key in currentObj) {
      const rawValue = currentObj[key];
      const value = JSON.stringify(rawValue);
      const path = currentPath + (isNumberString(key) ? `[${key}]` : `.${key}`);
      if (typeof rawValue === "object") {
        searchHelper(rawValue as ResponseBody, path);
      } else if (value.includes(search)) {
        paths.push({ value, path });
      }
    }
  };
  searchHelper(obj, "");
  return paths;
};

// TODO move into class
export const printFindDeveloperHelp = (
  req: Req,
  response: ProxyResponse,
  filePath: string,
  find: string | undefined
) => {
  // TODO exclude if (!find)
  if (!find) return; // Do not print anything if there is no search
  const matchMax = 80;
  const responseValuePaths = findObjectPaths(response, find);
  // TODO this chould be refactored to return strings
  if (responseValuePaths.length === 0) return printNoMatch(find, filePath);
  if (responseValuePaths.length > matchMax)
    return printLimit(responseValuePaths.length, find, matchMax, filePath);
  return print(
    generateResponseOverwriteCode(req, responseValuePaths, find, filePath)
  );
};

// TODO move into class
export const printResponseLogs = (
  settings: { responsesToLog?: RequestId[] },
  req: Req,
  response: ProxyResponse
) => {
  if (settings.responsesToLog?.includes(requestToId(req)))
    print(`${requestToId(req)}: ${JSON.stringify(response)}`);
};

// TODO Make sure only axios supported accept-encoding values are allowed by filtering list-strings like "gzip, deflate, br"
/** This insures there will be no type errors when using headers in axios. It also replaces accept-encoding to make sure axios can handle.*/
const convertHeaders = (headers: IncomingHttpHeaders) => ({
  ...Object.keys(headers).reduce(
    (obj, key) => ({ ...obj, [key]: headers[key]?.toString() ?? "" }),
    {}
  ),
  "accept-encoding": "gzip",
});

const getRequestBody = (req: Req): Promise<string> =>
  new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString().split("\\n").join("\r\n");
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });

const convertToAxiosRequestConfig = async (
  req: Req
): Promise<AxiosRequestConfig> => ({
  headers: convertHeaders(req.headers),
  url: `${req.headers.port === "443" ? "https" : "http"}://${req.headers.host}${
    req.url
  }`,
  method: req.method,
  //TODO find out, why this workaround is needed and bodies of GET requests seem to break things (maybe getRequestBody is not written right/ see print in getRequestBody)
  ...(req.method === "POST" ? { data: await getRequestBody(req) } : {}),
});

/** @description Snapshots responses for request and provide them as stubs. */
// TODO write tests for class
export class HttpApiProxyServer {
  private overwrites: ProxyResponses;
  private settings: HttpApiProxyServerSettings;
  private initialOverwrites: ProxyResponses;
  private initialSettings: HttpApiProxyServerSettings;
  private cache: ResponseCacheConnector;
  private httpServer: HttpServer;

  /**
   * @description
   * Hosting a local proxy server which replies to all known queries the same
   * way every time. It will fetch and remember replies from the real API in
   * case an unknown request is sent to it.
   *
   * @param overwrites
   * This allows the user to overwrite returns for specific queries.
   * set it to {find: 'some value you want to replace'} to get helpful autogenerated code.
   **/
  constructor({
    cacheDirPath,
    settings = {
      proxyBehavior: defaultProxyBehavior,
      sourceHost: "www.example.com",
      sourcePort: 443,
      proxyPort: 80,
    },
    overwrites = {},
  }: {
    cacheDirPath: string[];
    settings: HttpApiProxyServerSettings;
    overwrites?: ProxyResponses;
  }) {
    settings.proxyBehavior ||= defaultProxyBehavior;
    this.settings = clone(settings);
    this.overwrites = clone(overwrites);
    this.initialSettings = this.settings;
    this.initialOverwrites = this.overwrites;
    // TODO do not pass requestToId but import inside ResponseCacheConnector
    this.cache = new ResponseCacheConnector(cacheDirPath, requestToId);

    this.httpServer = createServer((req, res) => {
      this.resolveRequest(req).then((response) => {
        this.printReplacementCharAlert(JSON.stringify(response.body), req);
        this.printConsoleFeedback(req, response);
        this.replyToClient(res, response);
      });
    });
  }

  private printReplacementCharAlert = (stringValue: string, req: Req) => {
    if (this.cache.getMetaInfo(requestToId(req))["ignoreBrockenChars"]) return;
    const replacementChar = /\uFFFD/g;
    const brockenChars = JSON.stringify(stringValue).match(replacementChar);
    if (brockenChars?.length) {
      // TODO find a trigger for the line below
      //this.cache.saveMetaInfo(requestToId(req), { ignoreBrockenChars: true })
      print(
        `WARNING replacement-${brockenChars.length === 1 ? "char" : "chars"} ${
          brockenChars.length > 99
            ? `${brockenChars.join(", ").slice(0, 99)}...`
            : brockenChars.join(", ")
        } in ${this.cache.filePathForRequest(req)}`
      );
    }
  };

  private getLocalResponseIfExists = (requestId: RequestId) =>
    this.overwrites[requestId] || this.cache.getResponse(requestId) || null;

  private resolveRequest = async (req: Req): Promise<ProxyResponse> => {
    const requestId = requestToId(req);
    const localResponse = this.getLocalResponseIfExists(requestId);
    switch (this.settings.proxyBehavior) {
      case "FORCE_UPDATE_ALL":
        return this.getApiResponseAndSaveToLocal(req);

      case "SAVE_RESPONSES_FOR_NEW_QUERIES":
        return localResponse || this.getApiResponseAndSaveToLocal(req);

      case "RELOAD_RESPONSES_WITH_ERRORS":
        return localResponse && !hasError(localResponse)
          ? localResponse
          : this.getApiResponseAndSaveToLocal(req);

      case "NO_REQUEST_FORWARDING":
        if (localResponse) return localResponse;
        else
          throw Error(
            `[HttpApiProxyServer proxyBehavior is set to ${this.settings.proxyBehavior}] No ${requestId} stored in the proxy cache`
          );
    }
    return localResponse;
  };

  private getApiResponseAndSaveToLocal = async (
    req: Req
  ): Promise<ProxyResponse> => {
    const apiResponse = await this.realApiResponse(req);
    this.cache.saveResponse(req, apiResponse);
    return apiResponse;
  };

  private realApiResponse = async (req: Req): Promise<ProxyResponse> => {
    req.headers.host = this.settings.sourceHost;
    req.headers.port = this.settings.sourcePort.toString();
    try {
      const requestConfig = await convertToAxiosRequestConfig(req);
      const { data, status } = await axios(requestConfig);
      return { body: data, status };
    } catch (error) {
      const axiosError = error as AxiosError;
      print(`Error ${axiosError.code}: ${axiosError.message}`);
      return {
        body: {
          errors: [
            {
              message: `[HttpApiProxyServer] No successful response from ${req.headers.host}`,
            },
            axiosError.toJSON() as { message: string },
          ],
        },
        status: parseInt(axiosError.status?.toString() ?? "500"),
      };
    }
  };

  /** Prints console outputs depending on its inputs. No output is also possible */
  private printConsoleFeedback = (req: Req, response: ProxyResponse) => {
    const filePath = this.cache.filePathForRequest(req);
    // TODO cleanup parameter order (once in class)
    printFindDeveloperHelp(req, response, filePath, this.settings?.find);
    printErrors(response, this.settings, filePath);
    printResponseLogs(this.settings, req, response);
  };

  // TODO Test using to have been called with (put handles in other function)
  private replyToClient = (
    res: Res,
    { body: apiResponseBody, status: apiResponseStatus }: ProxyResponse
  ) => {
    res.writeHead(apiResponseStatus, { "Content-Type": "application/json" }); // TODO check why or if needed
    res.writeHead(apiResponseStatus, { "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify(apiResponseBody));
  };

  /** @description adding and overwrites by object key */
  modifyOverwrites = (overwrites: ProxyResponses) => {
    this.overwrites = { ...this.overwrites, ...clone(overwrites) };
  };

  /** @description adding and overwrite settings by object key */
  modifySettings = (settings: HttpApiProxyServerSettings) => {
    this.settings = { ...this.settings, ...clone(settings) };
  };

  /** @description reset to the overwrites used during construction */
  resetOverwrites = () => {
    this.overwrites = this.initialOverwrites;
  };

  /** @description reset to the settings used during construction */
  resetSettings = () => {
    this.settings = this.initialSettings;
  };

  start = async () =>
    new Promise((resolve, reject) => {
      this.httpServer.listen(
        this.settings.proxyPort,
        undefined,
        undefined,
        () => resolve(undefined)
      );
      this.httpServer.on("error", (error) => {
        print(
          `HttpApiProxyServer failed to start on Port ${this.settings.proxyPort}`
        );
        reject(error);
      });
    });

  stop = async () =>
    new Promise((resolve, reject) => {
      this.httpServer.close((error) => {
        if (error) {
          print("HttpApiProxyServer failed to stop!");
          reject(error);
        } else {
          resolve(undefined);
        }
      });
    });
}
