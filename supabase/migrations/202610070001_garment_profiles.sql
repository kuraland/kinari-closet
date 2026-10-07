-- 追加意図: 写真だけでは判別しにくい形・丈・袖丈・厚み・重ね着役割を分離し、推薦とAI再順位付けの共通データとして保持する。処理日時: 2026-10-07 22:07 JST

alter table public.garments
  add column if not exists garment_length text not null default 'regular'
    check (garment_length in ('cropped', 'regular', 'long')),
  add column if not exists sleeve_length text not null default 'unknown'
    check (sleeve_length in ('unknown', 'sleeveless', 'short', 'threeQuarter', 'long')),
  add column if not exists thickness text not null default 'medium'
    check (thickness in ('light', 'medium', 'heavy')),
  add column if not exists layer_role text not null default 'standalone'
    check (layer_role in ('inner', 'standalone', 'layer', 'outer', 'none')),
  add column if not exists attribute_source text not null default 'legacy'
    check (attribute_source in ('legacy', 'assisted', 'user_confirmed', 'vision_ai')),
  add column if not exists attribute_confidence smallint not null default 50
    check (attribute_confidence between 0 and 100);

update public.garments
set garment_length = case
  when silhouette = 'short' then 'cropped'
  when silhouette = 'long' then 'long'
  else garment_length
end
where silhouette in ('short', 'long');

update public.garments
set sleeve_length = case
  when category not in ('tops', 'onepiece', 'outer') then 'unknown'
  when name ~* '(ノースリーブ|タンクトップ|sleeveless)' then 'sleeveless'
  when name ~* '(半袖|Tシャツ|Ｔシャツ|ポロシャツ)' or warmth = 1 then 'short'
  else 'long'
end
where sleeve_length = 'unknown';

update public.garments
set thickness = case
  when warmth <= 2 then 'light'
  when warmth >= 4 then 'heavy'
  else 'medium'
end,
layer_role = case
  when category = 'outer' then 'outer'
  when category in ('bottoms', 'shoes', 'accessory') then 'none'
  else 'standalone'
end
where attribute_source = 'legacy';
