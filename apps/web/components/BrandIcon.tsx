import Image from "next/image";

export interface BrandIconProps {
  size: number;
  opacity?: number;
}

export function BrandIcon({ size, opacity }: BrandIconProps) {
  return (
    <Image
      alt="ZIBBY"
      height={size}
      src="/z.i.b.b.y-icon.png"
      style={{ borderRadius: "50%", opacity }}
      width={size}
    />
  );
}
