export default async function CheckPatch(req, res) {
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

  dataSet.map((user) => {
    if (user.id === body.id) {
      user.name = body.name;
      user.age = body.age;
    }
  });

  const isUserPatched = dataSet.filter(
    (user) =>
      user.id === body.id && body.age === body.age && body.name === user.name
  );

  if (isUserPatched.length >= 1) {
    return res.code(200).send("User Informations changed");
  } else {
    return res.code(404).send("User not found !");
  }
}
