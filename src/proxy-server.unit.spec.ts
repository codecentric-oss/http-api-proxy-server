import {
  findObjectPaths,
  generateResponseOverwriteCode,
  printResponseLogs,
  hasError,
  isNumberString,
  printFindDeveloperHelp,
  Request,
  createRequestId,
} from "./proxy-server";
import { print, printLimit, printNoMatch } from "./print";

jest.mock("./print", () => ({
  print: jest.fn(() => null),
  printError: jest.fn(() => null),
  printLimit: jest.fn(() => null),
  printNoMatch: jest.fn(() => null),
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

const req1927740808 = createRequest({
  url: "/graphql?mock",
});

const mockResponses = {
  responseFor123456: { status: 200, body: { msg: "unknown response" } },
  responseFor0415987281: { status: 200, body: { msg: "req0415987281" } },
};

const basePath = "test/responses";
const path = basePath + "/test";
const existingPathMock = path + "/responseFor0415987281.json";

// TODO replace with mocks for wrapper functions
jest.mock("fs", () => ({
  existsSync: jest.fn(
    (filepath) =>
      filepath === existingPathMock ||
      filepath === basePath ||
      filepath === path
  ),
  readFileSync: jest.fn(() =>
    JSON.stringify(mockResponses.responseFor0415987281)
  ),
}));

describe("Proxy-Server", () => {
  beforeEach(() => {
    jest.clearAllMocks(); // resets call counts for the mocks
  });

  it("generateMockCode will generate the correct mock code", () => {
    const potentialMockPaths = [
      { path: ".this.is.a.path", value: "example-value1" },
      { path: ".this.is.a.path.too", value: "example-value2" },
    ];
    const searchValue = "example";
    const filePath = "./responses/name/responseFor1927740808.json";

    const expectedCode = `You can change values containing "example" as follows:

    import responseFor1927740808 from './responses/name/responseFor1927740808.json'

    responseFor1927740808.this.is.a.path = example-value1
    responseFor1927740808.this.is.a.path.too = example-value2


    // Use the custom values like this:
    const proxyServer = new HttpApiProxyServer({
      cacheDirPath: ["put","your","path","here"],
      overwrites: {responseFor1927740808},
    })

    // Do not forget to run proxyServer.start() and proxyServer.stop() to use the proxy
    `;

    const generatedCode = generateResponseOverwriteCode(
      req1927740808,
      potentialMockPaths,
      searchValue,
      filePath
    );
    expect(generatedCode).toEqual(expectedCode);
  });

  describe("hasError", () => {
    it.each`
      resp                                     | expected
      ${{ body: { errors: [] }, status: 400 }} | ${true}
      ${{ body: { errors: [] }, status: 200 }} | ${true}
      ${{ body: {}, status: 400 }}             | ${true}
      ${{ body: {}, status: 200 }}             | ${false}
    `("returns $expected when response is $resp", ({ resp, expected }) => {
      expect(hasError(resp)).toBe(expected);
    });
  });

  describe("createRequestId", () => {
    const prefix = "responseFor";

    it(`returns a string that starts with ${prefix}`, () => {
      const result1 = createRequestId({
        url: "/graphql?mock",
        body: undefined,
      });
      const result2 = createRequestId({
        url: "/graphql?test",
        body: undefined,
      });
      expect(result1.startsWith(prefix)).toBe(true);
      expect(result2.startsWith(prefix)).toBe(true);
    });

    it("returns a different value for different urls", () => {
      const result1 = createRequestId({
        url: "/graphql?mock",
        body: undefined,
      });
      const result2 = createRequestId({
        url: "/graphql?test",
        body: undefined,
      });
      expect(result1).not.toEqual(result2);
    });

    it("returns a different value for different body data", () => {
      const result1 = createRequestId({ url: "/graphql", body: "data1" });
      const result2 = createRequestId({ url: "/graphql", body: "data2" });
      expect(result1).not.toEqual(result2);
    });

    it("returns a valide filename or variable name for Typescript", () => {
      const result = createRequestId({ url: "/graphql?mock", body: undefined });
      expect(/[^a-zA-Z0-9_]/.test(result)).toBe(false);
    });
  });

  describe("isNumberString", () => {
    it.each`
      value        | expected
      ${"123"}     | ${true}
      ${"0"}       | ${true}
      ${"-42"}     | ${true}
      ${""}        | ${false}
      ${"one"}     | ${false}
      ${"1string"} | ${false}
      ${"test2"}   | ${false}
    `("returns $expected when value is $value", ({ value, expected }) => {
      expect(isNumberString(value)).toBe(expected);
    });
  });

  describe("findObjectPaths", () => {
    it("will return the paths to a JSON field containg the search value", () => {
      expect(
        findObjectPaths(
          {
            status: 200,
            body: { key1: { a: "no", b: "a test" }, key2: "the test" },
          },
          "test"
        )
      ).toEqual([
        { path: ".body.key1.b", value: '"a test"' },
        { path: ".body.key2", value: '"the test"' },
      ]);
    });

    it("will handle arrays", () => {
      expect(
        findObjectPaths(
          {
            status: 200,
            body: {
              key1: {
                a: "no",
                b: [
                  "the test",
                  "or",
                  "a test",
                  ["test", { something: ["x", "testing"], value: "test" }],
                ],
              },
            },
          },
          "test"
        )
      ).toEqual([
        { path: ".body.key1.b[0]", value: '"the test"' },
        { path: ".body.key1.b[2]", value: '"a test"' },
        { path: ".body.key1.b[3][0]", value: '"test"' },
        { path: ".body.key1.b[3][1].something[1]", value: '"testing"' },
        { path: ".body.key1.b[3][1].value", value: '"test"' },
      ]);
    });
  });

  // TODO split into fn cases
  test.each`
    matchCount | fn
    ${0}       | ${"printNoMatch"}
    ${1}       | ${"print"}
    ${42}      | ${"print"}
    ${80}      | ${"print"}
    ${81}      | ${"printLimit"}
    ${123}     | ${"printLimit"}
  `(
    "printFindDeveloperHelp will call only $fn if there are $matchCount matches",
    ({ matchCount, fn }) => {
      const body = { a: Array.from({ length: matchCount }).fill("t") };
      printFindDeveloperHelp(req1927740808, { status: 200, body }, "", "t");
      expect(print).toHaveBeenCalledTimes(fn === "print" ? 1 : 0);
      expect(printLimit).toHaveBeenCalledTimes(fn === "printLimit" ? 1 : 0);
      expect(printNoMatch).toHaveBeenCalledTimes(fn === "printNoMatch" ? 1 : 0);
    }
  );

  describe("handleResponseLogs", () => {
    test("will not log anyting if settings do not request any response logs", () => {
      printResponseLogs({}, req1927740808, {
        status: 200,
        body: { t: "test" },
      });
      expect(print).not.toHaveBeenCalled();
    });

    test("will not log anyting if the response is not matching", () => {
      printResponseLogs(
        {
          responsesToLog: ["responseFor123456", "responseFor987654"],
        },
        req1927740808,
        { status: 200, body: { t: "test" } }
      );
      expect(print).not.toHaveBeenCalled();
    });

    test("will log matching responses", () => {
      printResponseLogs(
        {
          responsesToLog: [req1927740808.requestId, "responseFor123456"],
        },
        req1927740808,
        { status: 200, body: { t: "test" } }
      );
      expect(print).toHaveBeenCalled();
    });
  });
});
