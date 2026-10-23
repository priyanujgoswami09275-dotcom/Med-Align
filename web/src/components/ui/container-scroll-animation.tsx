import { useRef } from 'react';
import type { ReactNode } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import type { MotionValue } from 'motion/react';

/** A restrained, scroll-linked 3D glass frame for the interactive tool screens. */
export function ContainerScroll({
  children,
  titleComponent,
  className = '',
}: {
  children: ReactNode;
  titleComponent?: ReactNode;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  });

  // The card is only subtly tilted while entering/leaving the viewport and is
  // flat at the midpoint. Never shrink interactive content below its layout size.
  const rotate = useTransform(scrollYProgress, [0, 0.5, 1], [4, 0, -4]);
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [1.01, 1, 1.01]);
  const translate = useTransform(scrollYProgress, [0, 0.5, 1], [0, -8, 0]);

  return (
    <div ref={containerRef} data-scroll-container className={`relative w-full ${className}`}>
      <div className="relative w-full" style={{ perspective: '1000px' }}>
        {titleComponent && (
          <Header
            translate={translate}
            titleComponent={titleComponent}
            reduceMotion={reduceMotion}
          />
        )}
        <Card
          rotate={rotate}
          scale={scale}
          reduceMotion={reduceMotion}
          hasTitle={Boolean(titleComponent)}
        >
          {children}
        </Card>
      </div>
    </div>
  );
}

export function Header({
  translate,
  titleComponent,
  reduceMotion = false,
}: {
  translate: MotionValue<number>;
  titleComponent: ReactNode;
  reduceMotion?: boolean | null;
}) {
  return (
    <motion.div
      style={{ translateY: reduceMotion ? 0 : translate }}
      className="mx-auto max-w-5xl text-center"
    >
      {titleComponent}
    </motion.div>
  );
}

export function Card({
  rotate,
  scale,
  children,
  reduceMotion = false,
  hasTitle = false,
}: {
  rotate: MotionValue<number>;
  scale: MotionValue<number>;
  children: ReactNode;
  reduceMotion?: boolean | null;
  hasTitle?: boolean;
}) {
  return (
    <motion.div
      style={{
        rotateX: reduceMotion ? 0 : rotate,
        scale: reduceMotion ? 1 : scale,
        transformStyle: 'preserve-3d',
        boxShadow: 'var(--shadow-scroll)',
      }}
      data-scroll-card
      className={`glass-card mx-auto w-full rounded-[24px] border border-info/25 p-2 sm:p-3 ${hasTitle ? '-mt-3 sm:-mt-5' : ''}`}
    >
      <div className="min-w-0 rounded-[18px] bg-card/25 p-2 sm:p-3">{children}</div>
    </motion.div>
  );
}
