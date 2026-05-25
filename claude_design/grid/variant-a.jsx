// Variation A — Refined Minimal (now upgraded with working drag, outside-click
// menu close, and tweakable density/tag-style).
//
// Decisions:
//  • Trash icon goes away. Hover a row to reveal a single "···" affordance
//    that opens Rename / Move to series / Delete. Keyboard: ⌫ on selection.
//  • Multi-select: hover reveals a checkbox in the left gutter. cmd/shift-click
//    also works. When ≥1 selected, a floating action bar slides up.
//  • Series default to collapsed. Inline expand for ≤ ~20 posts; larger
//    series show a 3-row preview + "View all 132" that drills in.
//  • Toolbar: Search, +, view toggle, sidebar. (Was: grid/list, +, +folder,
//    expand, sidebar — expand removed, two news merged into one + with menu.)
//  • Drag a row by its handle (hover-left) to reorder. Drop on a series row
//    to move into that series. Drop targets get a soft accent ring.

const aPalette = {
  bg: "#ffffff",
  ink: "#1a1a1a",
  mute: "#6a6a6a",
  rule: "#ececec",
  hover: "#f6f6f5",
  postKey: "oklch(0.62 0.14 245)",
  seriesKey: "oklch(0.55 0.18 305)",
  accent: "oklch(0.62 0.14 245)",
  accentSoft: "oklch(0.95 0.04 245)",
};

function VariantA({ density = "comfortable", tagStyle = "filled" } = {}) {
  // Local data state — top-level posts + series. Reordering and moves mutate
  // these so the prototype actually moves rows around (not just a static comp).
  const [posts, setPosts] = React.useState(() => POSTS.map((p) => ({ ...p })));
  const [series, setSeries] = React.useState(() => SERIES.map((s) => ({
    ...s, posts: s.posts.map((p) => ({ ...p })),
  })));

  const [selected, setSelected] = React.useState(new Set());
  const [expanded, setExpanded] = React.useState(new Set(["s1"]));
  const [openMenu, setOpenMenu] = React.useState(null);
  const [renaming, setRenaming] = React.useState(null);
  const [drag, setDrag] = React.useState(null); // { id, kind: 'post' }
  const [dragOver, setDragOver] = React.useState(null); // { kind, id, position? }

  // Outside-click → close any open row menu.
  React.useEffect(() => {
    if (!openMenu) return;
    const off = (e) => {
      if (!e.target.closest('[data-a-menu]') && !e.target.closest('[data-a-menu-trigger]')) {
        setOpenMenu(null);
      }
    };
    document.addEventListener("pointerdown", off, true);
    return () => document.removeEventListener("pointerdown", off, true);
  }, [openMenu]);

  // Keyboard: ⌫ deletes selected, Esc clears selection.
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") setSelected(new Set());
      if ((e.key === "Backspace" || e.key === "Delete") && selected.size && !renaming) {
        e.preventDefault();
        deleteIds(selected);
        setSelected(new Set());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, renaming]);

  const toggleSel = (id, e) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };
  const toggleExpand = (id) => {
    const next = new Set(expanded);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpanded(next);
  };

  const deleteIds = (ids) => {
    setPosts((ps) => ps.filter((p) => !ids.has(p.id)));
    setSeries((ss) => ss
      .filter((s) => !ids.has(s.id))
      .map((s) => ({ ...s, posts: s.posts.filter((p) => !ids.has(p.id)) })));
  };
  const renameOne = (id, title) => {
    setPosts((ps) => ps.map((p) => p.id === id ? { ...p, title } : p));
    setSeries((ss) => ss.map((s) => s.id === id
      ? { ...s, title }
      : { ...s, posts: s.posts.map((p) => p.id === id ? { ...p, title } : p) }
    ));
  };

  // Drag handlers
  const onDragStart = (id) => setDrag({ id });
  const onDragEnd = () => { setDrag(null); setDragOver(null); };

  const onDropOnPost = (targetId, position) => {
    if (!drag || drag.id === targetId) return;
    setPosts((ps) => {
      const from = ps.findIndex((p) => p.id === drag.id);
      if (from < 0) return ps; // not a top-level post
      const item = ps[from];
      const without = ps.filter((_, i) => i !== from);
      const to = without.findIndex((p) => p.id === targetId);
      if (to < 0) return ps;
      const insertAt = position === "after" ? to + 1 : to;
      return [...without.slice(0, insertAt), item, ...without.slice(insertAt)];
    });
  };

  const onDropOnSeries = (seriesId) => {
    if (!drag) return;
    const post = posts.find((p) => p.id === drag.id);
    if (!post) return;
    setPosts((ps) => ps.filter((p) => p.id !== drag.id));
    setSeries((ss) => ss.map((s) => s.id === seriesId
      ? { ...s, posts: [post, ...s.posts] }
      : s));
    setExpanded((ex) => new Set([...ex, seriesId])); // open the series so you see it landed
  };

  const padY = density === "compact" ? 7 : 11;

  return (
    <div style={{
      width: "100%", height: "100%", background: aPalette.bg, color: aPalette.ink,
      fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
      fontSize: 14, display: "flex", flexDirection: "column", position: "relative",
      overflow: "hidden",
    }}>
      <Header />

      <div style={{ flex: 1, overflow: "auto", padding: "8px 0 96px" }}>
        <SectionHeader label="Posts" color={aPalette.postKey} count={posts.length} />
        <div style={{ padding: "4px 32px 18px" }}>
          {posts.map((p) => (
            <Row
              key={p.id}
              post={p}
              padY={padY}
              tagStyle={tagStyle}
              selected={selected.has(p.id)}
              renaming={renaming === p.id}
              menuOpen={openMenu === p.id}
              isDragging={drag?.id === p.id}
              dragOver={dragOver?.kind === "post" && dragOver.id === p.id ? dragOver.position : null}
              onSelect={(e) => toggleSel(p.id, e)}
              onMenu={() => setOpenMenu(openMenu === p.id ? null : p.id)}
              onRename={() => { setRenaming(p.id); setOpenMenu(null); }}
              onDoneRename={(v) => { if (v != null) renameOne(p.id, v); setRenaming(null); }}
              onDelete={() => { setOpenMenu(null); deleteIds(new Set([p.id])); }}
              onDragStart={() => onDragStart(p.id)}
              onDragEnd={onDragEnd}
              onDragOver={(pos) => setDragOver({ kind: "post", id: p.id, position: pos })}
              onDrop={(pos) => { onDropOnPost(p.id, pos); onDragEnd(); }}
            />
          ))}
          {/* Trailing drop zone — drop here to move a post out of any series */}
          {drag && (
            <DropTail
              active={dragOver?.kind === "post-tail"}
              onDragOver={(e) => { e.preventDefault(); setDragOver({ kind: "post-tail" }); }}
              onDrop={() => {
                if (!drag) return;
                // already handled by onDropOnPost for reorders; here is a no-op safety
                onDragEnd();
              }}
            />
          )}
        </div>

        <SectionHeader label="Series" color={aPalette.seriesKey} count={series.length} />
        <div style={{ padding: "4px 32px 24px" }}>
          {series.map((s) => {
            const isOpen = expanded.has(s.id);
            const preview = s.posts.length > 20 ? s.posts.slice(0, 3) : s.posts;
            return (
              <div key={s.id} style={{ marginBottom: 6 }}>
                <SeriesRow
                  series={s}
                  padY={padY}
                  tagStyle={tagStyle}
                  open={isOpen}
                  selected={selected.has(s.id)}
                  menuOpen={openMenu === s.id}
                  isDropTarget={dragOver?.kind === "series" && dragOver.id === s.id}
                  onToggle={() => toggleExpand(s.id)}
                  onSelect={(e) => toggleSel(s.id, e)}
                  onMenu={() => setOpenMenu(openMenu === s.id ? null : s.id)}
                  onDelete={() => { setOpenMenu(null); deleteIds(new Set([s.id])); }}
                  onDragOver={(e) => {
                    if (!drag) return;
                    e.preventDefault();
                    setDragOver({ kind: "series", id: s.id });
                  }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={() => { onDropOnSeries(s.id); onDragEnd(); }}
                />
                {isOpen && (
                  <div style={{
                    paddingLeft: 28, marginLeft: 12, borderLeft: `1px solid ${aPalette.rule}`,
                    marginTop: 2, marginBottom: 10,
                  }}>
                    {preview.map((p) => (
                      <Row
                        key={p.id}
                        post={p}
                        padY={padY - 2}
                        tagStyle={tagStyle}
                        compact
                        selected={selected.has(p.id)}
                        menuOpen={openMenu === p.id}
                        onSelect={(e) => toggleSel(p.id, e)}
                        onMenu={() => setOpenMenu(openMenu === p.id ? null : p.id)}
                        onDelete={() => { setOpenMenu(null); deleteIds(new Set([p.id])); }}
                      />
                    ))}
                    {s.posts.length > 20 && (
                      <button style={{
                        marginTop: 6, padding: "6px 8px", border: "none", background: "transparent",
                        color: aPalette.accent, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                      }}>
                        View all {s.posts.length} posts →
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {selected.size > 0 && (
        <BulkBar count={selected.size}
          onClear={() => setSelected(new Set())}
          onDelete={() => { deleteIds(selected); setSelected(new Set()); }} />
      )}
    </div>
  );
}

function Header() {
  return (
    <div style={{
      display: "flex", alignItems: "center", padding: "14px 20px",
      borderBottom: `1px solid ${aPalette.rule}`, gap: 14,
    }}>
      <Icon.Hamburger style={{ width: 18, height: 18, color: aPalette.mute }} />
      <Icon.Book style={{ width: 18, height: 18 }} />
      <div style={{ fontWeight: 600, letterSpacing: -0.1 }}>Posts</div>
      <div style={{ flex: 1 }} />
      <HBtn><Icon.Search style={{ width: 16, height: 16 }} /></HBtn>
      <HBtn primary><Icon.Plus style={{ width: 16, height: 16 }} /><span style={{ marginLeft: 6, fontSize: 13 }}>New</span></HBtn>
      <div style={{ display: "flex", border: `1px solid ${aPalette.rule}`, borderRadius: 6, overflow: "hidden" }}>
        <HBtn flat><Icon.Grid style={{ width: 15, height: 15 }} /></HBtn>
        <div style={{ background: "#eef3fb", padding: "6px 8px", display: "flex", alignItems: "center" }}>
          <Icon.List style={{ width: 15, height: 15, color: aPalette.accent }} />
        </div>
      </div>
      <HBtn><Icon.Sidebar style={{ width: 16, height: 16 }} /></HBtn>
    </div>
  );
}

function HBtn({ children, primary, flat }) {
  return (
    <button style={{
      display: "flex", alignItems: "center", padding: primary ? "6px 12px" : "6px 8px",
      border: flat ? "none" : `1px solid ${aPalette.rule}`,
      background: primary ? aPalette.ink : "#fff",
      color: primary ? "#fff" : aPalette.ink,
      borderRadius: flat ? 0 : 6, cursor: "pointer", fontFamily: "inherit",
    }}>{children}</button>
  );
}

function SectionHeader({ label, color, count }) {
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "18px 32px 6px", gap: 10 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color,
        textTransform: "uppercase",
      }}>{label}</div>
      <div style={{ fontSize: 11, color: aPalette.mute, fontFeatureSettings: '"tnum"' }}>{count}</div>
      <div style={{ flex: 1, height: 1, background: aPalette.rule, marginLeft: 4 }} />
    </div>
  );
}

function Tag({ name, tagStyle }) {
  if (tagStyle === "dot") {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        fontSize: 11.5, color: aPalette.mute,
      }}>
        <span style={{
          width: 7, height: 7, borderRadius: 999, background: tagColor(name),
        }} />
        {name}
      </span>
    );
  }
  if (tagStyle === "outline") {
    return (
      <span style={{
        fontSize: 11, padding: "1px 7px", borderRadius: 999,
        border: `1px solid ${tagColor(name, 0.35)}`, color: tagColor(name),
        background: "transparent", fontWeight: 500, lineHeight: 1.6, whiteSpace: "nowrap",
      }}>{name}</span>
    );
  }
  return (
    <span style={{
      fontSize: 11, padding: "2px 7px", borderRadius: 4, background: tagBg(name),
      color: tagColor(name), fontWeight: 500, lineHeight: 1.6, whiteSpace: "nowrap",
    }}>{name}</span>
  );
}

function DropIndicator({ at }) {
  // 2px accent line above/below row
  return (
    <div style={{
      position: "absolute", left: 22, right: 8, height: 2, borderRadius: 2,
      background: aPalette.accent, top: at === "before" ? -1 : undefined,
      bottom: at === "after" ? -1 : undefined,
      boxShadow: `0 0 0 2px ${aPalette.accentSoft}`,
    }} />
  );
}

function Row({
  post, compact, padY, tagStyle, selected, renaming, menuOpen,
  isDragging, dragOver,
  onSelect, onMenu, onRename, onDoneRename, onDelete,
  onDragStart, onDragEnd, onDragOver, onDrop,
}) {
  const [hover, setHover] = React.useState(false);
  const draggable = !!onDragStart && !renaming;
  return (
    <div
      draggable={draggable}
      onDragStart={(e) => { if (onDragStart) { e.dataTransfer.effectAllowed = "move"; onDragStart(); } }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        if (!onDragOver) return;
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        onDragOver(e.clientY < r.top + r.height / 2 ? "before" : "after");
      }}
      onDragLeave={() => onDragOver && onDragOver(null)}
      onDrop={(e) => { if (onDrop) { e.preventDefault(); onDrop(dragOver); } }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", padding: `${padY ?? (compact ? 9 : 11)}px 8px`,
        borderRadius: 6, cursor: draggable ? "grab" : "pointer", position: "relative",
        background: selected ? "#eef3fb" : (hover ? aPalette.hover : "transparent"),
        outline: selected ? `1px solid ${aPalette.accent}` : "none",
        outlineOffset: -1,
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      {dragOver === "before" && <DropIndicator at="before" />}
      {dragOver === "after" && <DropIndicator at="after" />}

      <div style={{ width: 22, display: "flex", justifyContent: "center", flexShrink: 0, position: "relative" }}>
        <Icon.Drag style={{
          width: 12, height: 12, color: aPalette.mute, position: "absolute",
          left: -16, opacity: hover && !selected ? 0.5 : 0, transition: "opacity 80ms",
          pointerEvents: "none",
        }} />
        <Checkbox checked={selected} visible={hover || selected} onClick={onSelect} />
      </div>

      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}>
        {renaming ? (
          <input
            autoFocus defaultValue={post.title}
            onBlur={(e) => onDoneRename(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onDoneRename(e.target.value);
              if (e.key === "Escape") onDoneRename(null);
            }}
            style={{
              flex: 1, fontFamily: "inherit", fontSize: compact ? 13.5 : 14,
              fontWeight: 600, padding: "2px 4px", border: `1px solid ${aPalette.accent}`,
              background: "#fff", borderRadius: 3, outline: "none", color: aPalette.ink,
            }}
          />
        ) : (
          <div
            onDoubleClick={() => onRename && onRename()}
            style={{
              fontSize: compact ? 13.5 : 14, fontWeight: 600, color: aPalette.ink,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>{post.title}</div>
        )}
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          {post.tags.map((t) => <Tag key={t} name={t} tagStyle={tagStyle} />)}
        </div>
      </div>

      <div style={{
        fontSize: 12, color: aPalette.mute, marginRight: 10, minWidth: 60,
        textAlign: "right", fontFeatureSettings: '"tnum"',
        opacity: hover ? 0 : 1, transition: "opacity 80ms",
      }}>{post.updated}</div>

      <div style={{
        position: "absolute", right: 10, display: "flex", gap: 2,
        opacity: hover || menuOpen ? 1 : 0, transition: "opacity 80ms",
      }}>
        <IconBtn data-a-menu-trigger onClick={(e) => { e.stopPropagation(); onMenu && onMenu(); }}>
          <Icon.More style={{ width: 14, height: 14, color: aPalette.mute }} />
        </IconBtn>
      </div>

      {menuOpen && (
        <div data-a-menu style={{
          position: "absolute", right: 8, top: "100%", marginTop: 2, zIndex: 5,
          background: "#fff", border: `1px solid ${aPalette.rule}`, borderRadius: 6,
          boxShadow: "0 8px 24px rgba(0,0,0,0.08)", minWidth: 180, padding: 4,
        }}>
          <MenuItem icon={<Icon.Pencil style={{ width: 14, height: 14 }} />} onClick={onRename}>Rename</MenuItem>
          <MenuItem icon={<Icon.Folder style={{ width: 14, height: 14 }} />}>Move to series…</MenuItem>
          <MenuItem icon={<Icon.Tag style={{ width: 14, height: 14 }} />}>Edit tags…</MenuItem>
          <div style={{ height: 1, background: aPalette.rule, margin: "4px 0" }} />
          <MenuItem icon={<Icon.Trash style={{ width: 14, height: 14 }} />} danger onClick={onDelete}>Delete</MenuItem>
        </div>
      )}
    </div>
  );
}

function SeriesRow({
  series, padY, tagStyle, open, selected, menuOpen, isDropTarget,
  onToggle, onSelect, onMenu, onDelete,
  onDragOver, onDragLeave, onDrop,
}) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        display: "flex", alignItems: "center", padding: `${padY}px 8px`,
        borderRadius: 6, position: "relative", cursor: "pointer",
        background: isDropTarget
          ? aPalette.accentSoft
          : selected ? "#f5edf9" : (hover ? aPalette.hover : "transparent"),
        outline: isDropTarget
          ? `1.5px solid ${aPalette.accent}`
          : selected ? `1px solid ${aPalette.seriesKey}` : "none",
        outlineOffset: -1, transition: "background 80ms, outline-color 80ms",
      }}
      onClick={onToggle}
    >
      <div style={{ width: 22, display: "flex", justifyContent: "center", flexShrink: 0 }}>
        <Checkbox checked={selected} visible={hover || selected} onClick={(e) => { e.stopPropagation(); onSelect(e); }} />
      </div>
      <Icon.Chevron style={{
        width: 14, height: 14, color: aPalette.mute, marginRight: 6,
        transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 120ms",
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{series.title}</div>
          <div style={{ display: "flex", gap: 4 }}>
            {series.tags.map((t) => <Tag key={t} name={t} tagStyle={tagStyle} />)}
          </div>
          {isDropTarget && (
            <div style={{
              marginLeft: "auto", fontSize: 11.5, fontWeight: 600,
              color: aPalette.accent, paddingRight: 8,
            }}>
              + Add to {series.title}
            </div>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: aPalette.mute, marginTop: 2 }}>
          series · {series.posts.length} posts · updated {series.updated}
        </div>
      </div>

      <div style={{
        position: "absolute", right: 10, display: "flex",
        opacity: hover || menuOpen ? 1 : 0, transition: "opacity 80ms",
      }}>
        <IconBtn data-a-menu-trigger onClick={(e) => { e.stopPropagation(); onMenu(); }}>
          <Icon.More style={{ width: 14, height: 14, color: aPalette.mute }} />
        </IconBtn>
      </div>

      {menuOpen && (
        <div data-a-menu style={{
          position: "absolute", right: 8, top: "100%", marginTop: 2, zIndex: 5,
          background: "#fff", border: `1px solid ${aPalette.rule}`, borderRadius: 6,
          boxShadow: "0 8px 24px rgba(0,0,0,0.08)", minWidth: 180, padding: 4,
        }} onClick={(e) => e.stopPropagation()}>
          <MenuItem icon={<Icon.Pencil style={{ width: 14, height: 14 }} />}>Rename</MenuItem>
          <MenuItem icon={<Icon.Plus style={{ width: 14, height: 14 }} />}>Add post…</MenuItem>
          <div style={{ height: 1, background: aPalette.rule, margin: "4px 0" }} />
          <MenuItem icon={<Icon.Trash style={{ width: 14, height: 14 }} />} danger onClick={onDelete}>Delete series</MenuItem>
        </div>
      )}
    </div>
  );
}

function DropTail({ active, onDragOver, onDrop }) {
  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{
        marginTop: 4, height: 28, borderRadius: 6,
        border: active ? `1.5px dashed ${aPalette.accent}` : `1.5px dashed transparent`,
        background: active ? aPalette.accentSoft : "transparent",
        transition: "border-color 80ms, background 80ms",
      }}
    />
  );
}

function Checkbox({ checked, visible, onClick }) {
  if (!visible && !checked) return <div style={{ width: 14, height: 14 }} />;
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick && onClick(e); }}
      style={{
        width: 14, height: 14, borderRadius: 3,
        border: checked ? `1.5px solid ${aPalette.accent}` : `1.5px solid ${aPalette.mute}`,
        background: checked ? aPalette.accent : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer",
      }}
    >
      {checked && <Icon.Check style={{ width: 10, height: 10, color: "#fff" }} />}
    </div>
  );
}

function IconBtn({ children, onClick, ...rest }) {
  return (
    <button onClick={onClick} {...rest} style={{
      width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center",
      border: "none", background: "transparent", borderRadius: 4, cursor: "pointer",
    }}>{children}</button>
  );
}

function MenuItem({ icon, children, danger, onClick }) {
  return (
    <div onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 10, padding: "7px 10px",
      borderRadius: 4, cursor: "pointer", fontSize: 13,
      color: danger ? "#c0392b" : aPalette.ink,
    }}
    onMouseEnter={(e) => e.currentTarget.style.background = aPalette.hover}
    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
      <span style={{ color: danger ? "#c0392b" : aPalette.mute }}>{icon}</span>
      {children}
    </div>
  );
}

function BulkBar({ count, onClear, onDelete }) {
  return (
    <div style={{
      position: "absolute", bottom: 18, left: "50%", transform: "translateX(-50%)",
      background: aPalette.ink, color: "#fff", borderRadius: 10, padding: "8px 8px 8px 16px",
      display: "flex", alignItems: "center", gap: 6, fontSize: 13,
      boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
    }}>
      <span style={{ marginRight: 8 }}>{count} selected</span>
      <BulkBtn icon={<Icon.Folder style={{ width: 14, height: 14 }} />}>Move</BulkBtn>
      <BulkBtn icon={<Icon.Tag style={{ width: 14, height: 14 }} />}>Tag</BulkBtn>
      <BulkBtn icon={<Icon.Trash style={{ width: 14, height: 14 }} />} danger onClick={onDelete}>Delete</BulkBtn>
      <div style={{ width: 1, height: 18, background: "rgba(255,255,255,0.18)", margin: "0 4px" }} />
      <button onClick={onClear} style={{
        background: "transparent", border: "none", color: "rgba(255,255,255,0.7)",
        cursor: "pointer", padding: "4px 8px", fontSize: 13, fontFamily: "inherit",
      }}>Clear</button>
    </div>
  );
}

function BulkBtn({ icon, children, danger, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 6,
      background: danger ? "rgba(255,90,90,0.16)" : "rgba(255,255,255,0.10)",
      color: danger ? "#ffb3b3" : "#fff", border: "none", cursor: "pointer",
      fontFamily: "inherit", fontSize: 13,
    }}>{icon}{children}</button>
  );
}

window.VariantA = VariantA;
