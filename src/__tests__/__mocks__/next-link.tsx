import React from "react";

const NextLink = ({
  href,
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => {
  return (
    <a href={href} {...props}>
      {children}
    </a>
  );
};

export default NextLink;
