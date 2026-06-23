import { redirect } from "next/navigation";

// Jobs is the default landing for everyone (owner and demos). The home route
// just forwards there; Today lives at /today. Server-side redirect, so there's
// no content flash.
export default function Home() {
  redirect("/jobs");
}
