import React from "react";

const NextImage = ({
  src,
  alt,
  fill: _fill,
  priority: _priority,
  ...props
}: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; priority?: boolean }) => {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src as string} alt={alt} {...props} />;
};

export default NextImage;
