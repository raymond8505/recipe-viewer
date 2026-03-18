import React from "react";

const NextImage = ({
  src,
  alt,
  fill: _fill,
  ...props
}: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean }) => {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src as string} alt={alt} {...props} />;
};

export default NextImage;
