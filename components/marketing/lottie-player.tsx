"use client";

import dynamic from "next/dynamic";
import type { LottieComponentProps } from "lottie-react";
import { useEffect, useState } from "react";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

interface LottiePlayerProps extends Omit<LottieComponentProps, "animationData"> {
  src: string;
  className?: string;
}

export function LottiePlayer({ src, className, ...props }: LottiePlayerProps) {
  const [data, setData] = useState<object | null>(null);

  useEffect(() => {
    fetch(src)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, [src]);

  if (!data) return null;

  return (
    <Lottie
      animationData={data}
      loop
      autoplay
      className={className}
      {...props}
    />
  );
}
