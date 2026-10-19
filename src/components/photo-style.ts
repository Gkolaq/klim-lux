// Size the image itself so its soft edge follows the photograph, not empty bars.
export function photoStyle(photo: {width:number;height:number}, frameRatio?:number) {
  const ratio=photo.width/photo.height;
  return `--photo-ratio:${ratio};${frameRatio?`--photo-fit-width:${Math.min(1,ratio/frameRatio)*100}%;`:''}`;
}
