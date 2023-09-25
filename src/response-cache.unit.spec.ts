import { Request, createRequestId } from "./proxy-server";
import { ResponseCacheConnector } from "./response-cache";

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
});
