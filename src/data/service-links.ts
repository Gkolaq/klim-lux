const RELATIONS: Readonly<Record<string, readonly string[]>> = {
  upholstery: ['restoration', 'covers'],
  restoration: ['upholstery', 'details'],
  covers: ['upholstery', 'restoration'],
  details: ['restoration', 'covers'],
};

/** Resolve only services present in the current localized owner content. */
export function relatedServices<T extends {slug: string}>(services: readonly T[], slug: string): T[] {
  return (RELATIONS[slug] ?? []).flatMap(target => {
    const service = services.find(item => item.slug === target && item.slug !== slug);
    return service ? [service] : [];
  });
}
