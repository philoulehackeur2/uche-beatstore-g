export const TAG_TAXONOMY = {
  genre:       ['Trap','Drill','Afrobeats','Amapiano','R&B','Hip-hop','UK Drill','Jersey Club','Dancehall','Lo-fi','Pluggnb','Pop'],
  mood:        ['Dark','Melodic','Aggressive','Chill','Emotional','Hype','Romantic','Cinematic','Eerie'],
  instruments: ['808s','Piano','Guitar','Strings','Flute','Vocal sample','Brass','Synth','Bells'],
  status:      ['Ready to send','Needs mix','Reference only','Exclusive','Leased','In use'],
} as const;

export type TagCategory = keyof typeof TAG_TAXONOMY;
