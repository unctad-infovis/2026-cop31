import './ChartMeta.css';

const ChartMeta = ({ note, source }) => {
  if (!source && !note) return null;
  return (
    <div className="chart_meta">
      {source && (
        <div className="chart_meta_row">
          <em>Source:</em> {source}
        </div>
      )}
      {note && (
        <div className="chart_meta_row">
          <em>Note:</em> {note}
        </div>
      )}
    </div>
  );
};

export default ChartMeta;
