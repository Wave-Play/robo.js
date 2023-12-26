export default async function getuser(req, res) {
  const dataSet = [
    {
      name: "michael",
      age: "31",
    },
    {
      name: "kevin",
      age: "32",
    },
  ];

  const query = req.query;
  const isUser = dataSet.filter((user) => user.name === query);

  if (isUser) {
    return res.send("User found !").code(200);
  } else {
    return res.send("User not found !").code(400);
  }
}
