export interface AppBackgroundProps {
  useCustomBackground: boolean;
  backgroundImage?: string;
  backgroundMotion: boolean;
}

export function AppBackground({
  useCustomBackground,
  backgroundImage,
  backgroundMotion,
}: AppBackgroundProps) {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {useCustomBackground && (
        <div
          className="absolute inset-0 bg-center bg-cover"
          style={{ backgroundImage: `url("${backgroundImage ?? ''}")` }}
        />
      )}

      {/* Light Mode Background */}
      <div
        className={`absolute inset-0 dark:hidden ${useCustomBackground ? 'bg-transparent' : 'bg-[#f8fafc]'}`}
      >
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        <div
          className={`absolute left-[4%] top-[6%] w-[520px] h-[520px] rounded-full bg-accent/10 blur-[110px] mix-blend-multiply ${backgroundMotion ? 'animate-glow-drift' : ''}`}
        ></div>
        <div
          className={`absolute right-[6%] top-[16%] w-[440px] h-[440px] rounded-full bg-accent/5 blur-[100px] mix-blend-multiply ${backgroundMotion ? 'animate-glow-drift-alt' : ''}`}
        ></div>
        <div
          className={`absolute left-[28%] bottom-[6%] w-[560px] h-[560px] rounded-full bg-accent/10 blur-[120px] mix-blend-multiply opacity-70 ${backgroundMotion ? 'animate-glow-drift-slow' : ''}`}
        ></div>
        {!useCustomBackground && (
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-slate-50/80"></div>
        )}
      </div>

      {/* Dark Mode Atmosphere */}
      <div
        className={`absolute inset-0 hidden dark:block ${useCustomBackground ? 'bg-transparent' : 'bg-[#05070f]'}`}
      ></div>
      <div
        className={`absolute inset-0 hidden dark:block ${backgroundMotion ? 'animate-aurora-shift' : ''}`}
        style={{
          backgroundImage:
            'radial-gradient(680px 420px at 14% 22%, rgb(var(--accent-color) / 0.15), transparent 62%), radial-gradient(560px 360px at 82% 18%, rgba(56,189,248,0.18), transparent 60%), radial-gradient(520px 320px at 54% 58%, rgb(var(--accent-color) / 0.08), transparent 70%), radial-gradient(820px 520px at 50% 88%, rgb(var(--accent-color) / 0.10), transparent 70%)',
          backgroundSize: backgroundMotion ? '140% 140%' : undefined,
          backgroundPosition: backgroundMotion ? '30% 20%' : undefined,
        }}
      ></div>
      {!useCustomBackground && (
        <div
          className="absolute inset-0 hidden dark:block opacity-40"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E\")",
            backgroundSize: '160px 160px',
            mixBlendMode: 'soft-light',
          }}
        ></div>
      )}
      <div
        className="absolute inset-0 hidden dark:block opacity-70"
        style={{
          backgroundImage:
            'radial-gradient(120% 60% at 50% 0%, rgba(255,255,255,0.06), transparent 55%)',
        }}
      ></div>
    </div>
  );
}
