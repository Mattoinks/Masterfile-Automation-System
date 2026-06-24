import type { Stats } from '../api';

interface StatsCardsProps {
  stats: Stats;
}

const cards = [
  { key: 'total_records' as const, label: 'Total Records', color: 'bg-blue-500' },
  { key: 'todays_uploads' as const, label: "Today's Uploads", color: 'bg-emerald-500' },
  { key: 'duplicates_found' as const, label: 'Duplicates Found', color: 'bg-amber-500' },
  { key: 'successful_inserts' as const, label: 'Successful Inserts', color: 'bg-violet-500' },
];

export function StatsCards({ stats }: StatsCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.key}
          className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex items-center gap-4"
        >
          <div className={`w-12 h-12 rounded-lg ${card.color} opacity-90`} />
          <div className="text-left">
            <p className="text-sm text-slate-500">{card.label}</p>
            <p className="text-2xl font-semibold text-slate-800">{stats[card.key]}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
