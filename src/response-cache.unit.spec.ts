import { Request, createRequestId, fallbackHeaders } from "./proxy-server";
import { ResponseCacheConnector } from "./response-cache";
import * as fs from "fs";
import { print } from "./print";

jest.mock("./print", () => ({
  print: jest.fn(() => null),
}));

jest.mock("fs", () => ({
  existsSync: jest.fn(() => false),
  readFileSync: jest.fn(() => "{}"),
  writeFileSync: jest.fn(() => undefined),
  appendFileSync: jest.fn(() => undefined),
  mkdirSync: jest.fn(() => undefined),
}));

const createRequest = (overwrites: Partial<Request>): Request => ({
  requestId: createRequestId({
    url: overwrites.url ?? "/",
    body: overwrites.body ?? undefined,
  }),
  method: "GET",
  url: "/",
  headers: {},
  body: undefined,
  ...overwrites,
});

describe("ResponseCacheConnector", () => {
  const req1927740808 = createRequest({ url: "/graphql?mock" });

  const cache = new ResponseCacheConnector(["test", "responses", "testName"]);

  test("filePathForHash will build valid path", () => {
    expect(cache.filePathForRequestId("hash")).toEqual(
      "test/responses/testName/hash.json"
    );
  });

  test("filePathForRequest will build valid path", () => {
    expect(cache.filePathForRequest(req1927740808)).toEqual(
      "test/responses/testName/responseFor1927740808.json"
    );
  });

  describe("getResponse", () => {
    const getResponseCache = new ResponseCacheConnector(["test", "responses"]);

    it("returns null when response file does not exist", () => {
      const result = getResponseCache.getResponse("nonexistent");
      expect(result).toBeNull();
    });

    it("returns cached response when file exists", () => {
      const mockResponse = {
        status: 200,
        headers: { "content-type": "application/json" },
        body: { data: "test" },
      };
      const fsMock = jest.spyOn(fs, "existsSync").mockImplementation((path) => {
        return path === "test/responses/responseFor123456.json";
      });
      const readFileMock = jest.spyOn(fs, "readFileSync").mockImplementation(() =>
        JSON.stringify(mockResponse)
      );

      const result = getResponseCache.getResponse("responseFor123456");

      expect(result).toEqual({
        status: 200,
        headers: { "content-type": "application/json" },
        body: { data: "test" },
      });

      fsMock.mockRestore();
      readFileMock.mockRestore();
    });

    it("uses fallback headers when headers are missing in file", () => {
      const mockResponse = {
        status: 200,
        body: { data: "test" },
      };
      const fsMock = jest.spyOn(fs, "existsSync").mockImplementation(() => true);
      const readFileMock = jest.spyOn(fs, "readFileSync").mockImplementation(() =>
        JSON.stringify(mockResponse)
      );

      const result = getResponseCache.getResponse("responseFor123456");

      expect(result?.headers).toEqual(fallbackHeaders);

      fsMock.mockRestore();
      readFileMock.mockRestore();
    });
  });

  describe("saveResponse", () => {
    const saveCache = new ResponseCacheConnector(["test", "temp"]);

    it("throws error when request URL is missing", () => {
      const requestWithoutUrl = {
        requestId: "responseFor123",
        method: "POST",
        headers: {},
        body: undefined,
        url: undefined,
      } as unknown as Request;

      const response = { status: 200, body: {} };

      expect(() => saveCache.saveResponse(requestWithoutUrl, response)).toThrow(
        "[saveResponse] Cannot handle a request with missing URL"
      );
    });

    it("creates directory if it does not exist", () => {
      const fsMock = jest.spyOn(fs, "existsSync").mockImplementation(() => false);
      const mkdirMock = jest.spyOn(fs, "mkdirSync").mockImplementation(() => undefined);
      const appendMock = jest.spyOn(fs, "appendFileSync").mockImplementation(() => undefined);
      const writeMock = jest.spyOn(fs, "writeFileSync").mockImplementation(() => undefined);

      const request = createRequest({ url: "/test" });
      const response = { status: 200, body: { test: true } };

      saveCache.saveResponse(request, response);

      expect(mkdirMock).toHaveBeenCalled();
      expect(appendMock).toHaveBeenCalled();
      expect(writeMock).toHaveBeenCalled();

      fsMock.mockRestore();
      mkdirMock.mockRestore();
      appendMock.mockRestore();
      writeMock.mockRestore();
    });

    it("logs to apiQuery.log when saving response", () => {
      const fsMock = jest.spyOn(fs, "existsSync").mockImplementation(() => true);
      const appendMock = jest.spyOn(fs, "appendFileSync").mockImplementation(() => undefined);
      const writeMock = jest.spyOn(fs, "writeFileSync").mockImplementation(() => undefined);

      const request = createRequest({ url: "/graphql?query=test" });
      const response = { status: 200, body: { data: "test" } };

      saveCache.saveResponse(request, response);

      expect(appendMock).toHaveBeenCalledWith(
        expect.stringContaining("apiQuery.log"),
        expect.any(String)
      );

      fsMock.mockRestore();
      appendMock.mockRestore();
      writeMock.mockRestore();
    });
  });

  describe("getMetaInfo", () => {
    const metaCache = new ResponseCacheConnector(["test", "meta"]);

    it("returns empty object when meta file does not exist", () => {
      const fsMock = jest.spyOn(fs, "existsSync").mockImplementation(() => false);

      const result = metaCache.getMetaInfo("responseFor123");

      expect(result).toEqual({});

      fsMock.mockRestore();
    });

    it("returns parsed meta info when file exists", () => {
      const metaInfo = { ignoreBrockenChars: true };
      const fsMock = jest.spyOn(fs, "existsSync").mockImplementation(() => true);
      const readFileMock = jest.spyOn(fs, "readFileSync").mockImplementation(() =>
        JSON.stringify(metaInfo)
      );

      const result = metaCache.getMetaInfo("responseFor123");

      expect(result).toEqual(metaInfo);

      fsMock.mockRestore();
      readFileMock.mockRestore();
    });
  });

  describe("saveMetaInfo", () => {
    const metaCache = new ResponseCacheConnector(["test", "meta"]);

    it("writes meta info to file", () => {
      const fsMock = jest.spyOn(fs, "existsSync").mockImplementation(() => true);
      const writeMock = jest.spyOn(fs, "writeFileSync").mockImplementation(() => undefined);

      const metaInfo = { ignoreBrockenChars: true };

      metaCache.saveMetaInfo("responseFor123", metaInfo);

      expect(writeMock).toHaveBeenCalledWith(
        expect.stringContaining("responseFor123.meta.json"),
        JSON.stringify(metaInfo)
      );

      fsMock.mockRestore();
      writeMock.mockRestore();
    });
  });

  describe("requireDir", () => {
    const dirCache = new ResponseCacheConnector(["test", "new", "dir"]);

    it("creates nested directories if they do not exist", () => {
      const existsMock = jest.spyOn(fs, "existsSync").mockImplementation(() => false);
      const mkdirMock = jest.spyOn(fs, "mkdirSync").mockImplementation(() => undefined);

      const request = createRequest({ url: "/test" });
      const response = { status: 200, body: { test: true } };

      dirCache.saveResponse(request, response);

      expect(mkdirMock).toHaveBeenCalledTimes(3);

      existsMock.mockRestore();
      mkdirMock.mockRestore();
    });

    it("does not create directories if they already exist", () => {
      const existsMock = jest.spyOn(fs, "existsSync").mockImplementation(() => true);
      const mkdirMock = jest.spyOn(fs, "mkdirSync").mockImplementation(() => undefined);

      const request = createRequest({ url: "/test" });
      const response = { status: 200, body: { test: true } };

      dirCache.saveResponse(request, response);

      expect(mkdirMock).not.toHaveBeenCalled();

      existsMock.mockRestore();
      mkdirMock.mockRestore();
    });
  });
});
