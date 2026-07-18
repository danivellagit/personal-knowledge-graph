# data/ (private, gitignored)

Everything in this folder is yours and stays on your machine. It is gitignored on purpose: it
holds real people, real conversations, health, money, family, the lot. Never commit it, never
copy it into a work repo or any shared surface. That boundary is the whole point.

The skills create these folders as they discover entities from your stream. You do not need to
make them by hand; this is just the map.

```
data/
  people/          one file per person (the anchor node)
  companies/       one file per company
  places/          restaurants, bars, clubs, gyms
  passions/        padel, wine, running, cooking
  cities/          Milano, Roma, Barcelona
  terms/           recurring topics, concepts, projects
  groups/          a course, a community, a crew
  bonds/           the nature of a tie: family, friend, colleague, partner, advisor, ex
  roles/           normalized job titles (created only when 2+ people share one)
  events/          trips, offsites, birthdays
  interactions/
    <slug>/YYYY-MM-DD.md    recent meetings, one file per day (append-only)
    <slug>/YYYY-MM.md       older months, rolled up
```

The node map, the edge table, and the rules live in [`../anatomy.md`](../anatomy.md).
