interface SectionHeadingProps {
  english: string;
  japanese: string;
}

export const SectionHeading = ({ english, japanese }: SectionHeadingProps) => {
  return (
    <h2 className="text-center mb-8">
      <div
        className="text-2xl md:text-3xl font-bold tracking-widest"
        style={{
          color: "var(--pub-accent,#c6a15b)",
          fontFamily: "'Noto Serif JP', serif",
        }}
      >
        {english}
      </div>
      <div className="text-sm text-[var(--pub-text,#f0e6d2)] mt-1 tracking-wider">
        {japanese}
      </div>
    </h2>
  );
};
