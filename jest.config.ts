module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleDirectories: ["node_modules", "proxy-server"],
  transform: { "^.+\\.tsx?$": "ts-jest" },
  testRegex: "\\.unit\\.spec\\.tsx?$",
};
