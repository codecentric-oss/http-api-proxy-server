export const print = (value: unknown): void => console.log(" 📨 API: ", value);

export const printLimit = (
  count: number,
  search: string,
  max: number,
  filePath: string
) => {
  print(
    `${count} paths in the API response stored in "${filePath}" found for "${search}" (For under ${max} matches you'll see paths listed here)`
  );
};

export const printNoMatch = (searchValue: string, filePath: string) => {
  print(
    `No path in the API response stored in "${filePath}" found for "${searchValue}"`
  );
};

export const printError = (status: string, message: string, filePath: string) =>
  `Error! Status ${status} ${message || ""} in ${filePath}
    Try reloading behavior : createMockServer( { proxyBehavior: "RELOAD_RESPONSES_WITH_ERRORS" } )
    Hide intended errors   : createMockServer( { hideErrors: true } )`;
