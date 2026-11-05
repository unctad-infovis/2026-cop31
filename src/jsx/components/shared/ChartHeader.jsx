import './ChartHeader.css';

const ChartHeader = ({ subtitle, title }) => (
  <div className="chart_header">
    <div className="chart_header_text">
      <h3 className="chart_header_title">{title}</h3>
      {subtitle && <h4 className="chart_header_subtitle">{subtitle}</h4>}
    </div>
  </div>
);

export default ChartHeader;
