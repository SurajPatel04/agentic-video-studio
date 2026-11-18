---
name: teach-data
description: Teach databases, SQL, indexes and data pipelines by showing the table change, not describing it.
metadata:
  roles:
  - planner
  category: subject
  tags:
  - sql
  - database
  - databases
  - query
  - index
  - indexes
  - indexing
  - table scan
  - etl
  - data pipeline
  - pipeline
  - pandas
  - dataframe
  - data science
  - data cleaning
  - data engineering
  - join
  - joins
  - group by
  - transaction
  - transactions
  - primary key
  - foreign key
  - schema
  - er diagram
  - dbms
  scenes:
  - QueryScene
  - PipelineScene
  - TableScene
  - JoinScene
  - SchemaScene
  - TransactionScene
  - LiveChartScene
  - IsoScene
  overlays: []
  visuals:
  - when: [index, indexes, indexing, table scan, query, sql query, where clause]
    scenes: [QueryScene]
  - when: [join, joins, inner join, left join, right join]
    scenes: [JoinScene, PipelineScene]
  - when: [transaction, transactions, commit, rollback, acid]
    scenes: [TransactionScene]
  - when: [primary key, foreign key, schema, er diagram, relationship, relationships, normalization]
    scenes: [SchemaScene]
  - when: [insert, update rows, delete rows, crud]
    scenes: [TableScene]
  - when: [etl, data pipeline, pipeline, pandas, dataframe, data cleaning, group by]
    scenes: [PipelineScene]
  long_video: false
---

Show data as a real small table the viewer can read (4-8 rows, 3-5 columns, everyday values like orders, students, cities). Keep the same table through the video so each idea is a new view of it. QueryScene and PipelineScene are paper style and allowed even when a style guide says "every scene IsoScene".

QueryScene - how a database answers a query: "query" (real SQL; WHERE and SELECT are read from it), "table" {"name", "columns", "rows"}, "mode": "scan" (every row is read, the counter climbs) or "index" (the sorted index finds the rows in a few steps). To teach indexes, make two scenes with the same query and table: first "scan", then "index", and say how many rows each one read.

PipelineScene - data moving through steps (ETL, pandas, cleaning, joins): "source" table, then "stages" (1-5), each {"label", "op": filter|map|join|group|sort|select|clean|load, "detail": the rule ("price > 10", "total = price * qty"), "columns" + "rows": the table AFTER that stage}. Compute every output yourself and keep the first column as a stable id so rows can be followed. A join stage can show the other table with "with".

LiveChartScene - a result as a chart whose numbers change: "data" {"label": value} or "series", kind bar | line | race; steps set {label, value}, add, sort, highlight. Use the same numbers as the table.

Each idea has its own animated scene (paper style, allowed with the house style); never explain these with a text card:
- TableScene: "table" + "steps" of INSERT / UPDATE / DELETE (row indices from 0, on the current rows).
- JoinScene: "left" and "right" tables, "leftKey" / "rightKey", "kind": inner | left | right; matching keys connect and the result builds itself (unmatched rows kept on the chosen side). For INNER vs LEFT, use two JoinScenes with the same tables.
- SchemaScene: "tables" with typed fields and PK / FK, "relationships" between fields (users 1 -> many orders).
- TransactionScene: "table", "steps" of changes, "outcome": commit | rollback (rollback restores the rows). Show a failure halfway to teach atomicity.

Use IsoScene for where data lives and moves (app -> server -> database -> warehouse). Do not invent benchmark numbers; say "reads every row" rather than a made-up time.
