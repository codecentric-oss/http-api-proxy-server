import { print, printLimit, printNoMatch, printError } from "./print";

describe("print", () => {
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it("prints value with the API prefix", () => {
    print("test message");
    expect(consoleLogSpy).toHaveBeenCalledWith(" 📨 API: ", "test message");
  });

  it("handles different types of values", () => {
    print({ key: "value" });
    expect(consoleLogSpy).toHaveBeenCalledWith(" 📨 API: ", { key: "value" });
  });
});

describe("printLimit", () => {
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it("prints limit message with count and search value", () => {
    printLimit(100, "searchTerm", 80, "/path/to/file.json");
    expect(consoleLogSpy).toHaveBeenCalledWith(
      " 📨 API: ",
      '100 paths in the API response stored in "/path/to/file.json" found for "searchTerm" (For under 80 matches you\'ll see paths listed here)'
    );
  });

  it("handles edge case at exact max limit", () => {
    printLimit(80, "test", 80, "file.json");
    expect(consoleLogSpy).toHaveBeenCalled();
  });
});

describe("printNoMatch", () => {
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it("prints no match message", () => {
    printNoMatch("searchValue", "/path/to/file.json");
    expect(consoleLogSpy).toHaveBeenCalledWith(
      " 📨 API: ",
      'No path in the API response stored in "/path/to/file.json" found for "searchValue"'
    );
  });
});

describe("printError", () => {
  it("returns error message with status code and file path", () => {
    const result = printError("404", "Not Found", "/path/to/file.json");
    expect(result).toContain("Error! Status 404");
    expect(result).toContain("Not Found");
    expect(result).toContain("/path/to/file.json");
    expect(result).toContain("RELOAD_RESPONSES_WITH_ERRORS");
    expect(result).toContain("hideErrors");
  });

  it("handles empty message", () => {
    const result = printError("500", "", "/path/to/file.json");
    expect(result).toContain("Error! Status 500");
    expect(result).toContain("in /path/to/file.json");
  });

  it("contains suggestion to reload behavior", () => {
    const result = printError("500", "Server Error", "file.json");
    expect(result).toContain("RELOAD_RESPONSES_WITH_ERRORS");
  });
});
