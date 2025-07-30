import { expect, test } from "@playwright/test";
import { HttpApiProxyServer } from "../../src";
import responseFor0258897338 from "./responses/responseFor0258897338.json";

test.describe("Mocked API-Response to keep it the same for tests (without proxy server it changes over time)", () => {
  const server = new HttpApiProxyServer({
    cacheDirPath: ["use-cases", "tests", "responses"],
    settings: {
      sourceHost: "official-joke-api.appspot.com",
      sourcePort: 443,
      proxyPort: 8080,
    },
  });
  test.beforeAll(async () => await server.start());
  test.afterAll(async () => await server.stop());

  test("Test Page is up", async ({ page }) => {
    await page.goto("http://0.0.0.0:8000/");
    const button = page.getByText("Get Joke");
    await expect(button).toBeVisible();
  });

  test("proxy allows to test page displays a joke from the API ", async ({
    page,
  }) => {
    await page.goto("http://0.0.0.0:8000/");
    const button = page.getByText("Get Joke");
    await button.click();
    const text = page.getByText(
      "What's the object-oriented way to become wealthy? Inheritance"
    );
    await expect(text).toBeVisible();
  });

  test("proxy allows response overwrite is working ", async ({ page }) => {
    responseFor0258897338.body.setup = "Joke-Setup";
    responseFor0258897338.body.punchline = "Punchline";
    server.modifyOverwrites({ responseFor0258897338 });
    await page.goto("http://0.0.0.0:8000/");
    const button = page.getByText("Get Joke");
    await button.click();
    const text = page.getByText("Joke-Setup Punchline");
    await expect(text).toBeVisible();
    server.resetOverwrites();
  });
});

test.describe("Mocked API-Error-Responses without spamming your APIs Error logging", () => {
  const server = new HttpApiProxyServer({
    cacheDirPath: ["use-cases", "tests", "error-responses"],
    settings: {
      proxyBehavior: "FORCE_UPDATE_ALL",
      sourceHost: "postman-echo.com",
      sourcePort: 443,
      proxyPort: 8080,
    },
  });
  test.beforeAll(async () => await server.start());
  test.afterAll(async () => await server.stop());

  test.describe("should forward Error code", () => {
    for (const statusCode of [301, 400, 403, 404, 500, 503]) {
      test(statusCode.toString(), async ({ request }) => {
        let responseCode = 0;
        try {
          responseCode = (
            await request.get(`http://0.0.0.0:8080/status/${statusCode}`)
          ).status();
        } catch {
          expect(responseCode).toBe(statusCode);
        }
      });
    }
  });

  test.describe("proxy error payload behavior for code", () => {
    for (const statusCode of [400, 403, 404]) {
      test(`${statusCode} should not return custom error format`, async ({
        request,
      }) => {
        const response = await request.get(
          `http://0.0.0.0:8080/status/${statusCode}`
        );
        const data = await response.text();
        expect(JSON.stringify(data)).not.toContain("[HttpApiProxyServer]");
      });
    }

    for (const statusCode of [500, 503]) {
      test(`${statusCode} should return custom error format`, async ({
        request,
      }) => {
        const response = await request.get(
          `http://0.0.0.0:8080/status/${statusCode}`
        );
        const data = await response.json();
        expect(JSON.stringify(data)).toContain("[HttpApiProxyServer]");
      });
    }
  });

  test("forwarding codes are resolved and not teated as errors", async ({
    request,
  }) => {
    let responseCode = 0;
    try {
      responseCode = (
        await request.get(`http://0.0.0.0:8080/status/${301}`)
      ).status();
    } catch {
      expect(responseCode).not.toBe(301);
    }
    expect(responseCode).toBe(200);
  });
});
