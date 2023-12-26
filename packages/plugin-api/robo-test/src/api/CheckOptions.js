export default async function CheckOptions(req, res) {
  if (req.req.method === "OPTIONS") {
    res.code(200).send("lol");
    return;
  } else {
    res.code(404).send("dx");
    return;
  }
}
