import { Compass } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/primitives";

export default function NotFound() {
  return <EmptyState icon={<Compass className="h-6 w-6" />} title="Page not found" description="That page doesn't exist. Let's get you back to studying." action={<ButtonLink to="/">Go home</ButtonLink>} />;
}
