export default async function CheckDelete(req, res) {
  let dataSet = [
    {
      name: "michael",
      age: 56,
      id: 9999,
    },
    {
      name: "kevin",
      age: 32,
      id: 6683,
    },
  ];
  const body = req.body;

  const deletedUser = dataSet.filter((user) => user.id !== body.id);

  if (deletedUser.length <= 0) {
    return res.code(200).send("User Correctly deleted");
  } else {
    return res.code(404).send("User not found !");
  }
}
