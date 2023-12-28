export default async function CheckCrash() {
  throw new Error(
    "I AM THROWN INSIDE AN API ROUTE AND I AM NOT CRASHING MOM IM ON TV"
  );
}
