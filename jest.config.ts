module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleDirectories: ["node_modules", "src"],
  transform: { "^.+\\.tsx?$": "ts-jest" },
  testRegex: "\\.unit\\.spec\\.tsx?$",
};
