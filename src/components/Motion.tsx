"use client";

import { motion, HTMLMotionProps } from 'framer-motion';

export const MotionDiv = (props: HTMLMotionProps<"div">) => <motion.div {...props} />;
export const MotionH1 = (props: HTMLMotionProps<"h1">) => <motion.h1 {...props} />;
export const MotionH2 = (props: HTMLMotionProps<"h2">) => <motion.h2 {...props} />;
export const MotionP = (props: HTMLMotionProps<"p">) => <motion.p {...props} />;
export const MotionSpan = (props: HTMLMotionProps<"span">) => <motion.span {...props} />;
