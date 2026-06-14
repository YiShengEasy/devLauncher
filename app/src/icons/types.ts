import type { ComponentType, SVGProps } from "react";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  size?: number;
  title?: string;
  decorative?: boolean;
}

export type IconComponent = ComponentType<IconProps>;
