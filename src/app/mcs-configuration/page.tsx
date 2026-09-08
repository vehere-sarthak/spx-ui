import { redirect } from "next/navigation";

/** kebab-case alias used in some configs */
export default function McsConfigurationKebabPage() {
  redirect("/command?view=cms");
}
