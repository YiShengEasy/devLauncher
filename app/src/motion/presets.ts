import gsap from "gsap";
import { motionDuration, motionEase, motionStagger } from "./tokens";

export function animatePanelEnter(target: gsap.TweenTarget, reduced: boolean) {
  return gsap.fromTo(
    target,
    { autoAlpha: reduced ? 1 : 0, y: reduced ? 0 : 10, scale: reduced ? 1 : 0.985 },
    {
      autoAlpha: 1,
      y: 0,
      scale: 1,
      duration: reduced ? 0 : motionDuration.panel,
      ease: motionEase.enter,
      overwrite: "auto",
    },
  );
}

export function animateDialogEnter(target: gsap.TweenTarget, reduced: boolean) {
  return gsap.fromTo(
    target,
    { autoAlpha: reduced ? 1 : 0, y: reduced ? 0 : 14, scale: reduced ? 1 : 0.965 },
    {
      autoAlpha: 1,
      y: 0,
      scale: 1,
      duration: reduced ? 0 : motionDuration.dialog,
      ease: motionEase.enter,
      overwrite: "auto",
    },
  );
}

export function animateListEnter(targets: gsap.TweenTarget, reduced: boolean) {
  return gsap.fromTo(
    targets,
    { autoAlpha: reduced ? 1 : 0, y: reduced ? 0 : 7, scale: reduced ? 1 : 0.99 },
    {
      autoAlpha: 1,
      y: 0,
      scale: 1,
      duration: reduced ? 0 : motionDuration.quick,
      ease: motionEase.standard,
      stagger: reduced ? 0 : motionStagger.normal,
      overwrite: "auto",
    },
  );
}

export function pressButton(target: gsap.TweenTarget, reduced: boolean) {
  if (reduced) return gsap.set(target, { scale: 1, y: 0 });
  return gsap.timeline({ defaults: { overwrite: "auto" } })
    .to(target, { scale: 0.97, y: 1, duration: motionDuration.instant, ease: motionEase.exit })
    .to(target, { scale: 1, y: 0, duration: motionDuration.micro, ease: motionEase.standard });
}
