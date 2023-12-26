export default async function CheckHead(req, res) {
  res.header("one-header", "token");
  res.header("another", "x");
  res.header("trof", "fort");

  return res.send("send");
}
