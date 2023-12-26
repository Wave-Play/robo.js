export default async function getuser(req, res) {
  let dataSet = [
    {
      name: "michael",
      age: "31",
    },
    {
      name: "kevin",
      age: "32",
    },
  ];
  const body = req.body;
  dataSet = [];
  dataSet.push(body);
  const isUser = dataSet[0].name === "x" && dataSet[0].id === 9999;

  if (isUser) {
    return res.code(200).send("User found !");
  } else {
    return res.code(404).send("User not found !");
  }
}
