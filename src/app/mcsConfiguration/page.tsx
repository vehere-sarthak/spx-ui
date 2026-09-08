import { redirect } from "next/navigation";

/** vehere-ui Dashboard URL → SpiderX Command CMS view */
export default function McsConfigurationPage() {
  redirect("/command?view=cms");
}
