import type { SVGAttributes } from 'react';

interface TGIconProps extends SVGAttributes<SVGSVGElement> {
  size?: number;
}

export function TGIcon({ size = 16, width, height, ...props }: TGIconProps) {
  return <svg width={width ?? size} height={height ?? size} {...props} />;
}
