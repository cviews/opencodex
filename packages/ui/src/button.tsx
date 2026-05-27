import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';

const buttonVariants = cva('inline-flex items-center justify-center rounded font-medium transition-colors', {
  variants: {
    variant: {
      primary: 'bg-[#10A37F] text-white hover:bg-[#0E8C6B]',
      secondary: 'bg-[#2A2B2D] text-[#D8DEE9] hover:bg-[#343541]',
      ghost: 'text-[#9EA1AA] hover:text-[#D8DEE9]',
    },
    size: {
      sm: 'h-8 px-3 text-sm',
      md: 'h-10 px-4 text-base',
      lg: 'h-12 px-6 text-lg',
    },
  },
  defaultVariants: {
    variant: 'primary',
    size: 'md',
  },
});

interface TGButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export function TGButton({ className, variant, size, ...props }: TGButtonProps) {
  return <button className={buttonVariants({ variant, size, className })} {...props} />;
}
