import { Skeleton } from "@/components/ui/primitives";

export default function PaymentsLoading() {
  return (
    <div className="page-stack">
      <div className="stack" style={{ gap: 10 }}>
        <Skeleton height={10} width="150px" />
        <Skeleton height={34} width="240px" />
        <Skeleton height={12} width="620px" />
      </div>
      <div className="usage-hero">
        <div className="balance-panel stack" style={{ gap: 12 }}>
          <Skeleton height={10} width="130px" />
          <Skeleton height={44} width="180px" />
          <Skeleton height={12} width="90%" />
        </div>
        <div className="panel">
          <div className="panel-header">
            <Skeleton height={14} width="150px" />
          </div>
          <div className="panel-body">
            <div className="payment-pack-grid">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton height={190} key={index} />
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="metric-grid">
        {Array.from({ length: 4 }).map((_, index) => (
          <div className="metric" key={index}>
            <Skeleton height={9} width="52%" />
            <Skeleton height={28} width="38%" />
            <Skeleton height={9} width="66%" />
          </div>
        ))}
      </div>
      <div className="panel">
        <div className="panel-header">
          <Skeleton height={14} width="170px" />
        </div>
        <div className="panel-body stack">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton height={42} key={index} />
          ))}
        </div>
      </div>
    </div>
  );
}
