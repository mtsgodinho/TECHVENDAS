import Image from "next/image";
export default function Brand() {
  return (
    <a
      href="/"
      className="brand brand-logo"
      aria-label="TechVendas — by TechView"
    >
      <Image
        src="/techvendas-logo.png"
        alt="TechVendas — by TechView"
        width={1536}
        height={1024}
        sizes="(max-width: 700px) 180px, 220px"
        className="brand-mark"
      />
    </a>
  );
}
