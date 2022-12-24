import fs from "fs";
fs.writeFile("./users.json", JSON.stringify({}), (error) => {
  console.error(error);
});

import fs from "fs";
fs.writeFile("./channels.json", JSON.stringify({}), (error) => {
  console.log(error);
});
