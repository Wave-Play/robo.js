export default async function statistics(req, res) {
  const body = req.body;

  if (!body.sales) {
    return res.code(404).send("WRONG REQUESSSSSSSSSSSST !");
  }
  return res.code(200).send("Saleeeeeeeeees !");
}
