import { BUILTIN_ICON_COMPONENTS } from "@/icons";
import type { BuiltinFeature } from "@/types/actions";

interface BuiltinIconProps {
  feature: BuiltinFeature;
  size?: number;
  title?: string;
}

export function BuiltinIcon({ feature, size = 20, title }: BuiltinIconProps) {
  const Icon = BUILTIN_ICON_COMPONENTS[feature as keyof typeof BUILTIN_ICON_COMPONENTS];
  return <Icon size={size} title={title} decorative={!title} />;
}
