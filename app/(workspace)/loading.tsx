import { Skeleton } from "@/components/ui/primitives";

export default function WorkspaceLoading() {
  return (
    <div className="page-stack">
      <div className="stack" style={{ gap: 10 }}>
        <Skeleton height={10} width="120px" />
        <Skeleton height={34} width="300px" />
        <Skeleton height={12} width="520px" />
      </div>
      <div className="metric-grid">
        {Array.from({ length: 5 }).map((_, index) => (
          <div className="metric" key={index}>
            <Skeleton height={9} width="52%" />
            <Skeleton height={28} width="38%" />
            <Skeleton height={9} width="66%" />
          </div>
        ))}
      </div>
      <div className="grid-2">
        <div className="panel">
          <div className="panel-header"><Skeleton height={14} width="150px" /></div>
          <div className="panel-body stack">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton height={42} key={index} />
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="panel-header"><Skeleton height={14} width="120px" /></div>
          <div className="panel-body stack">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton height={52} key={index} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
