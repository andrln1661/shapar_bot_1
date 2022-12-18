import fs from "fs";
fs.writeFile("./users.json", JSON.stringify({}), (error) => {
  console.error(error);
});
