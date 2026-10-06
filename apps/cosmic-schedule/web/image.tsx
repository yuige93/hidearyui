import type { ImgHTMLAttributes } from 'react';

// Static SVG artwork needs no server image optimizer in this deployment.
export default function StaticImage(props: ImgHTMLAttributes<HTMLImageElement>) {
  // eslint-disable-next-line next/no-img-element
  return <img {...props} alt={props.alt ?? ''} />;
}
