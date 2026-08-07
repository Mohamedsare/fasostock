"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  MdArrowForward,
  MdExpandMore,
  MdInfoOutline,
  MdLightbulbOutline,
  MdMenuBook,
  MdSearch,
  MdWarningAmber,
} from "react-icons/md";
import { FsCard, fsInputClass } from "@/components/ui/fs-screen-primitives";
import {
  DOC_ARTICLES,
  DOC_GROUPS,
  articleSearchText,
  type DocArticle,
  type DocBlock,
} from "@/lib/features/help/documentation";
import { cn } from "@/lib/utils/cn";

/** Recherche insensible aux accents et à la casse — « peremption » doit trouver « Péremptions ». */
function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

const NOTE_STYLES = {
  info: {
    Icon: MdInfoOutline,
    wrap: "border-sky-500/25 bg-sky-500/[0.07]",
    icon: "text-sky-600",
    title: "text-sky-800",
  },
  tip: {
    Icon: MdLightbulbOutline,
    wrap: "border-emerald-500/25 bg-emerald-500/[0.07]",
    icon: "text-emerald-600",
    title: "text-emerald-800",
  },
  warn: {
    Icon: MdWarningAmber,
    wrap: "border-amber-500/30 bg-amber-500/[0.09]",
    icon: "text-amber-600",
    title: "text-amber-800",
  },
} as const;

function Block({ block }: { block: DocBlock }) {
  if (block.kind === "p") {
    return <p className="text-sm leading-relaxed text-neutral-800">{block.text}</p>;
  }

  if (block.kind === "bullets" || block.kind === "steps") {
    const ordered = block.kind === "steps";
    return (
      <div>
        {block.title ? (
          <p className="mb-2 text-[13px] font-bold text-fs-text">{block.title}</p>
        ) : null}
        <ul className="space-y-2">
          {block.items.map((item, i) => (
            <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-neutral-800">
              {ordered ? (
                <span
                  className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-fs-accent/12 text-[11px] font-bold text-fs-accent"
                  aria-hidden
                >
                  {i + 1}
                </span>
              ) : (
                <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-fs-accent" aria-hidden />
              )}
              <span className="min-w-0">{item}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (block.kind === "table") {
    return (
      <div>
        {block.title ? (
          <p className="mb-2 text-[13px] font-bold text-fs-text">{block.title}</p>
        ) : null}
        <div className="overflow-x-auto rounded-xl border border-black/[0.08]">
          <table className="w-full min-w-[420px] border-collapse text-left text-sm">
            <thead>
              <tr className="bg-fs-surface-container">
                {block.head.map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-neutral-500"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map(([a, b]) => (
                <tr key={a} className="border-t border-black/[0.06] align-top">
                  <td className="w-[38%] px-3 py-2.5 font-semibold text-fs-text">{a}</td>
                  <td className="px-3 py-2.5 leading-relaxed text-neutral-800">{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const s = NOTE_STYLES[block.tone];
  return (
    <div className={cn("flex gap-2.5 rounded-xl border p-3", s.wrap)}>
      <s.Icon className={cn("mt-0.5 h-5 w-5 shrink-0", s.icon)} aria-hidden />
      <div className="min-w-0">
        <p className={cn("text-[13px] font-bold", s.title)}>{block.title}</p>
        <p className="mt-1 text-sm leading-relaxed text-neutral-800">{block.text}</p>
      </div>
    </div>
  );
}

function ArticleItem({
  article,
  open,
  onToggle,
}: {
  article: DocArticle;
  open: boolean;
  onToggle: () => void;
}) {
  const panelId = `doc-panel-${article.id}`;
  return (
    <div id={article.id} className="scroll-mt-20 border-b border-black/[0.06] last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-start gap-3 px-1 py-3.5 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-fs-text">{article.title}</p>
          <p className="mt-0.5 text-sm leading-snug text-neutral-600">{article.tagline}</p>
        </div>
        <MdExpandMore
          className={cn(
            "mt-1 h-5 w-5 shrink-0 text-neutral-400 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <div id={panelId} className="px-1 pb-5">
          <div className="mb-4 flex flex-col gap-2 rounded-xl bg-fs-surface-container p-3 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5">
            <span className="text-neutral-700">
              <span className="font-semibold text-fs-text">Qui y a accès :</span> {article.access}
            </span>
            {article.activation ? (
              <span className="text-neutral-700">
                <span className="font-semibold text-fs-text">Activation :</span> {article.activation}
              </span>
            ) : null}
            {article.route ? (
              <Link
                href={article.route}
                className="inline-flex w-fit items-center gap-1 font-semibold text-fs-accent underline-offset-2 hover:underline"
              >
                Ouvrir la page
                <MdArrowForward className="h-4 w-4" aria-hidden />
              </Link>
            ) : null}
          </div>

          <div className="flex flex-col gap-4">
            {article.blocks.map((b, i) => (
              <Block key={i} block={b} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function HelpDocumentation() {
  const [query, setQuery] = useState("");
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  /** Index calculé une fois : le contenu est statique. */
  const index = useMemo(
    () => new Map(DOC_ARTICLES.map((a) => [a.id, fold(articleSearchText(a))])),
    [],
  );

  const needle = fold(query.trim());
  const matches = useMemo(() => {
    if (needle.length < 2) return null;
    const words = needle.split(/\s+/);
    return new Set(
      DOC_ARTICLES.filter((a) => {
        const hay = index.get(a.id) ?? "";
        return words.every((w) => hay.includes(w));
      }).map((a) => a.id),
    );
  }, [needle, index]);

  const groups = useMemo(
    () =>
      DOC_GROUPS.map((g) => ({
        ...g,
        articles: matches ? g.articles.filter((a) => matches.has(a.id)) : g.articles,
      })).filter((g) => g.articles.length > 0),
    [matches],
  );

  function toggle(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const total = DOC_ARTICLES.length;
  const shown = groups.reduce((n, g) => n + g.articles.length, 0);

  return (
    <section className="mb-8">
      <div className="mb-1 flex items-center gap-2">
        <MdMenuBook className="h-6 w-6 shrink-0 text-fs-accent" aria-hidden />
        <h2 className="text-lg font-bold text-fs-text">Documentation complète</h2>
      </div>
      <p className="mb-4 text-sm text-neutral-600">
        Les {total} modules de FasoStock, expliqués un par un : à quoi ils servent, comment on les
        utilise, et les pièges à éviter.
      </p>

      <div className="relative mb-4">
        <MdSearch
          className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Chercher : crédit, inventaire, facture, péremption…"
          aria-label="Rechercher dans la documentation"
          className={fsInputClass("pl-10")}
        />
      </div>

      {matches ? (
        <p className="mb-3 text-sm text-neutral-600">
          {shown === 0
            ? "Aucun module ne correspond. Essayez un autre mot, ou contactez-nous ci-dessous."
            : `${shown} module${shown > 1 ? "s" : ""} trouvé${shown > 1 ? "s" : ""}.`}
        </p>
      ) : null}

      <div className="flex flex-col gap-5">
        {groups.map((g) => (
          <FsCard key={g.id} padding="p-4 sm:p-5">
            <h3 className="text-base font-bold text-fs-text sm:text-lg">{g.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-neutral-600">{g.summary}</p>
            <div className="mt-3 border-t border-black/[0.06]">
              {g.articles.map((a) => (
                <ArticleItem
                  key={a.id}
                  article={a}
                  open={openIds.has(a.id) || Boolean(matches)}
                  onToggle={() => toggle(a.id)}
                />
              ))}
            </div>
          </FsCard>
        ))}
      </div>
    </section>
  );
}
