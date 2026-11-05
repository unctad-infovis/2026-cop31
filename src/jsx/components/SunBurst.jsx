import LoadFile from '@unctad-infovis/general-tools/helpers/LoadFile.js';
import useIsVisible from '@unctad-infovis/general-tools/helpers/UseIsVisible.js';
import chroma from 'chroma-js';
import * as d3 from 'd3';
// d3 is flagged as side effect free, so the bundler drops selection.transition() unless d3-transition is imported explicitly.
import 'd3-transition';
import { useEffect, useMemo, useRef, useState } from 'react';

import countries from '../helpers/Countries.js';
import ChartHeader from './shared/ChartHeader.jsx';
import ChartMeta from './shared/ChartMeta.jsx';

import './SunBurst.css';

// Inspiration for the sunburst: https://observablehq.com/@carmen-tm/women-architects-i-didnt-hear-about?collection=@observablehq/featured-creators and https://www.youtube.com/watch?v=-yIHxOui9nQ.

const SIZE = 940;
const CENTER = SIZE / 2;
const INNER_RADIUS = 0;
const OUTER_RADIUS = 400;
const DOMAIN = [-3.5, 3.5];
const SCALE_LIMIT = 3;
const RING_POINTS = [-2, -1, 0, 1, 2, 3];
const CONTINENT_RADIUS = 301;
// The number of entries per continent in data.json, incl. the empty spacers between the continents.
const CONTINENTS = [
  { name: 'Africa', value: 58 },
  { name: 'Asia', value: 50 },
  { name: 'Europe', value: 59 },
  { name: 'Oceania', value: 30 },
  { name: 'N. America', value: 41 },
  { name: 'S. America', value: 14 }
];
const GLOBAL_START_YEAR = 1850;
const GLOBAL_SCALE_LIMIT = 1.5;
const INTRO_DURATION = 2800;
const YEAR_INTERVAL = 300;
const LINE_WIDTH = 200;
const LINE_HEIGHT = 40;

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// https://gka.github.io/chroma.js/
const colorScale = chroma.scale('RdYlBu').domain([SCALE_LIMIT, 0, -SCALE_LIMIT]);
const legendGradient = `linear-gradient(to right, ${d3
  .range(-SCALE_LIMIT, SCALE_LIMIT + 0.5, 0.5)
  .map(value => colorScale(value).hex())
  .join(', ')})`;

// Same colouring as the world temperature in the bar chart.
const textColorScale = chroma.scale(['red', 'rgba(0, 0, 0, 0.3)', 'blue']).padding(-1).domain([GLOBAL_SCALE_LIMIT, 0, -GLOBAL_SCALE_LIMIT]);
const formatTemp = value => {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(2)}°C`;
};

const y = d3.scaleLinear().range([INNER_RADIUS, OUTER_RADIUS]).domain(DOMAIN);
const yLine = d3.scaleLinear().range([LINE_HEIGHT, 0]).domain([-1, 1]);

// The angle of d3.arc and d3.pie starts at 12 o'clock and runs clockwise.
const polar = (radius, angle) => [radius * Math.sin(angle), -radius * Math.cos(angle)];
const isBottomHalf = angle => angle > Math.PI / 2 && angle < (3 * Math.PI) / 2;
const isLeftSide = angle => (angle + Math.PI) % (2 * Math.PI) < Math.PI;

// Path along which the continent name is written, reversed on the bottom half so the text is never upside down.
const continentPath = ({ endAngle, startAngle }) => {
  const flip = isBottomHalf(endAngle);
  const [x0, y0] = polar(CONTINENT_RADIUS, flip ? endAngle : startAngle);
  const [x1, y1] = polar(CONTINENT_RADIUS, flip ? startAngle : endAngle);
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M${x0} ${y0}A${CONTINENT_RADIUS} ${CONTINENT_RADIUS} 0 ${large} ${flip ? 0 : 1} ${x1} ${y1}`;
};

const SunBurst = () => {
  const figureRef = useRef(null);
  const [setChartNode, isVisible, chartNode] = useIsVisible(0.3);

  const x = useMemo(
    () =>
      d3
        .scaleBand()
        .range([Math.PI / 2 + 0.07, Math.PI / 2 + 2 * Math.PI - 0.1])
        .align(0),
    []
  );
  const arc = useMemo(
    () =>
      d3
        .arc()
        .innerRadius(y(DOMAIN[0]))
        .outerRadius(d => (d.temp !== null ? y(Math.max(-SCALE_LIMIT, d.temp)) : y(DOMAIN[0])))
        .startAngle(d => x(d.id))
        .endAngle(d => x(d.id) + x.bandwidth())
        .padRadius(INNER_RADIUS),
    [x]
  );

  const [data, setData] = useState(null);
  const [globalTemps, setGlobalTemps] = useState(null);
  const [year, setYear] = useState(null);
  const [isBuilt, setIsBuilt] = useState(false);
  const [introDone, setIntroDone] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [tooltip, setTooltip] = useState(null);

  // The elements d3 manages directly.
  const barsRef = useRef(null);
  const yearTextRef = useRef(null);
  const tempTextRef = useRef(null);
  const lineRef = useRef(null);
  const dataRef = useRef(null);
  const yearRef = useRef(null);

  const years = useMemo(() => (data ? Object.keys(data).map(Number) : []), [data]);
  const startYear = years[0];
  const lastYear = years[years.length - 1];

  useEffect(() => {
    let cancelled = false;
    Promise.all([LoadFile('assets/data/data.json'), LoadFile('assets/data/global_temperature.json')])
      .then(responses => Promise.all(responses.map(response => response?.json())))
      .then(([json, globalJson]) => {
        if (cancelled || !json || !globalJson) return;
        const first = Object.keys(json)[0];
        x.domain(json[first].map(d => d.id));
        dataRef.current = json;
        setGlobalTemps(
          Object.entries(globalJson)
            .sort(([a], [b]) => a - b)
            .map(([, value]) => value)
        );
        setData(json);
        setYear(Number(first));
      });
    return () => {
      cancelled = true;
    };
  }, [x]);

  // Build the chart once, when it is scrolled into view.
  useEffect(() => {
    if (!data || !globalTemps || !isVisible || !chartNode || isBuilt) return;
    const reduceMotion = prefersReducedMotion();
    const firstYearData = data[startYear];

    const svg = d3.select(chartNode).append('svg').attr('viewBox', `0 0 ${SIZE} ${SIZE}`).attr('role', 'img').attr('aria-label', `Radial bar chart of the annual mean temperature anomaly of each country relative to 1951–1980, ${startYear}–${lastYear}. Temperatures rise across all regions.`);
    const root = svg.append('g').attr('class', 'chart_elements');
    const centered = className => root.append('g').attr('class', className).attr('transform', `translate(${CENTER},${CENTER})`);

    // Bars.
    barsRef.current = centered('bars_container')
      .selectAll('path')
      .data(firstYearData)
      .join('path')
      .attr('data-id', d => d.id)
      .attr('fill', d => (d.temp !== null ? colorScale(Math.max(-SCALE_LIMIT, d.temp)).hex() : 'transparent'))
      .attr('d', arc)
      .style('pointer-events', 'none')
      .attr('opacity', 0);
    barsRef.current
      .transition()
      .duration(reduceMotion ? 0 : 300)
      .delay((_d, i) => (reduceMotion ? 0 : i * 10))
      .attr('opacity', 1);

    // Blurred background and the year in the center.
    const defs = svg.append('defs');
    defs.append('filter').attr('id', 'center-blur').attr('filterUnits', 'objectBoundingBox').attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%').append('feGaussianBlur').attr('in', 'SourceGraphic').attr('stdDeviation', 20);
    root
      .append('circle')
      .attr('class', 'center_bg')
      .attr('cx', CENTER)
      .attr('cy', CENTER)
      .attr('r', 175 / 2)
      .attr('filter', 'url(#center-blur)');
    const centerText = root.append('g').attr('class', 'center_text').attr('text-anchor', 'middle');
    yearTextRef.current = centerText
      .append('text')
      .attr('class', 'center_year')
      .attr('x', CENTER)
      .attr('y', CENTER + 3)
      .text(startYear);
    tempTextRef.current = centerText
      .append('text')
      .attr('class', 'center_temp')
      .attr('x', CENTER)
      .attr('y', CENTER + 30);
    const firstGlobalTemp = globalTemps[startYear - GLOBAL_START_YEAR];
    tempTextRef.current.text(formatTemp(firstGlobalTemp)).style('fill', textColorScale(firstGlobalTemp).hex());

    // Rings.
    const rings = root.append('g').attr('class', 'chart_legend_rings');
    rings
      .selectAll('circle')
      .data(RING_POINTS)
      .join('circle')
      .attr('class', d => (d === 0 ? 'ring ring_zero' : 'ring'))
      .attr('cx', CENTER)
      .attr('cy', CENTER)
      .attr('r', d => y(d));
    rings
      .selectAll('text')
      .data(RING_POINTS)
      .join('text')
      .attr('class', d => (d === 0 ? 'ring_label ring_label_zero' : 'ring_label'))
      .attr('x', d => CENTER + y(d) + 3)
      .attr('y', CENTER + 3)
      .text(d => `${d > 0 ? '+' : ''}${d}.0°C`);

    // Country labels and the radial lines.
    centered('bars_info_container')
      .selectAll('g')
      .data(firstYearData)
      .join('g')
      .attr('class', 'bar_info_container')
      .attr('transform', d => `rotate(${((x(d.id) + x.bandwidth() / 2) * 180) / Math.PI - 90})`)
      .attr('text-anchor', d => (isLeftSide(x(d.id) + x.bandwidth() / 2) ? 'end' : 'start'))
      .each((d, i, nodes) => {
        const group = d3.select(nodes[i]);
        const left = isLeftSide(x(d.id) + x.bandwidth() / 2);
        group
          .append('text')
          .attr('data-id', d.id)
          .attr('x', left ? -y(DOMAIN[1]) - 10 : y(DOMAIN[1]) + 10)
          .attr('y', 0)
          .attr('transform', left ? 'rotate(180)' : 'rotate(0)')
          .text(d.temp !== null ? d.id : '');
        if (d.temp !== null) {
          group
            .append('line')
            .attr('x1', 87)
            .attr('x2', y(DOMAIN[1]) + 5)
            .attr('y1', 0)
            .attr('y2', 0);
        }
      })
      .style('pointer-events', 'none');

    // Continent names along an arc.
    const pie = d3
      .pie()
      .startAngle((95 * Math.PI) / 180)
      .endAngle((85 * Math.PI) / 180 + 2 * Math.PI)
      .value(d => d.value)
      .sort(null);
    const continents = pie(CONTINENTS);
    const continentGroup = centered('continent_text');
    continentGroup
      .selectAll('path')
      .data(continents)
      .join('path')
      .attr('id', (_d, i) => `continent_arc${i}`)
      .attr('d', continentPath)
      .attr('fill', 'none');
    continentGroup
      .selectAll('text')
      .data(continents)
      .join('text')
      .attr('dy', d => (isBottomHalf(d.endAngle) ? 10 : 0))
      .append('textPath')
      .attr('href', (_d, i) => `#continent_arc${i}`)
      .attr('startOffset', '50%')
      .attr('text-anchor', 'middle')
      .text(d => d.data.name);

    // Small line chart of the global mean temperature.
    const line = root
      .append('g')
      .attr('class', 'line_container')
      .attr('transform', `translate(${CENTER + 230}, 20)`);
    line.append('text').attr('class', 'line_label').attr('x', 5).text('world');
    line
      .append('g')
      .attr('class', 'grid')
      .call(
        d3
          .axisLeft(yLine)
          .ticks(1)
          .tickFormat(i => `${i}°C`)
          .tickSizeInner(-LINE_WIDTH)
          .tickSizeOuter(0)
      );
    lineRef.current = line.append('path').attr('class', 'current_avg_temp_line');

    // Hover layer, on top of everything else.
    const dimOthers = id => {
      barsRef.current.classed('dimmed', d => id !== null && d.id !== id);
      root.selectAll('.bars_info_container text').classed('dimmed', function () {
        return id !== null && this.dataset.id !== id;
      });
    };
    centered('bars_aux')
      .selectAll('path')
      .data(firstYearData.filter(d => d.temp !== null))
      .join('path')
      .attr('data-id', d => d.id)
      .attr(
        'd',
        d3
          .arc()
          .innerRadius(INNER_RADIUS)
          .outerRadius(OUTER_RADIUS + 35)
          .startAngle(d => x(d.id))
          .endAngle(d => x(d.id) + x.bandwidth())
          .padRadius(INNER_RADIUS)
      )
      .on('pointermove', (event, d) => {
        const rect = figureRef.current.getBoundingClientRect();
        dimOthers(d.id);
        setTooltip({ id: d.id, left: event.clientX - rect.left, top: event.clientY - rect.top });
      })
      .on('pointerleave', () => {
        dimOthers(null);
        setTooltip(null);
      });

    setIsBuilt(true);
  }, [arc, chartNode, data, globalTemps, isBuilt, isVisible, lastYear, startYear, x]);

  // The first year is drawn, wait a moment before the years start to roll.
  useEffect(() => {
    if (!isBuilt) return;
    const reduceMotion = prefersReducedMotion();
    const timeout = setTimeout(
      () => {
        setIntroDone(true);
        setPlaying(!reduceMotion);
        if (reduceMotion) setYear(lastYear);
      },
      reduceMotion ? 0 : INTRO_DURATION
    );
    return () => clearTimeout(timeout);
  }, [isBuilt, lastYear]);

  // Roll through the years.
  useEffect(() => {
    if (!playing) return;
    const interval = setInterval(() => setYear(current => Math.min(current + 1, lastYear)), YEAR_INTERVAL);
    return () => clearInterval(interval);
  }, [lastYear, playing]);

  useEffect(() => {
    if (year === lastYear) setPlaying(false);
  }, [lastYear, year]);

  // Update the drawing when the year changes.
  useEffect(() => {
    if (!introDone || year === null) return;
    yearRef.current = year;
    barsRef.current
      .data(data[year])
      .transition()
      .duration(100)
      .attr('fill', d => (d.temp !== null ? colorScale(Math.max(-SCALE_LIMIT, d.temp)).hex() : 'transparent'))
      .attr('d', arc);
    yearTextRef.current.text(year);
    const globalTemp = globalTemps[year - GLOBAL_START_YEAR];
    tempTextRef.current.text(formatTemp(globalTemp)).style('fill', textColorScale(globalTemp).hex());
    const xLine = d3.scaleLinear().range([0, LINE_WIDTH]).domain([-1, years.length]);
    lineRef.current.attr(
      'd',
      d3
        .line()
        .x((_d, i) => xLine(i))
        .y(d => yLine(d))(globalTemps.slice(startYear - GLOBAL_START_YEAR, year - GLOBAL_START_YEAR + 1))
    );
  }, [arc, data, globalTemps, introDone, startYear, year, years.length]);

  const handleSliderChange = event => {
    setPlaying(false);
    setYear(Number.parseInt(event.target.value, 10));
  };

  const tooltipTemp = tooltip && data ? data[year].find(d => d.id === tooltip.id)?.temp : null;

  return (
    <figure className="container_sunburst" ref={figureRef}>
      <ChartHeader subtitle={`Annual regional mean temperature anomalies relative to a (1951–1980) baseline, °C, ${startYear ?? ''}–${lastYear ?? ''}`} title="Global heating: Temperatures rise across all regions" />
      <div className="range_container">
        <span className="label">{startYear}</span>
        <input aria-label="Year" disabled={!introDone} max={lastYear} min={startYear} onChange={handleSliderChange} type="range" value={year ?? ''} />
        <span className="label">{lastYear}</span>
      </div>
      <div className="chart_container" ref={setChartNode} />
      <div aria-hidden="true" className="scale_container">
        <span>-{SCALE_LIMIT}°C</span>
        <div className="scale_bar" style={{ background: legendGradient }}>
          <span className="scale_zero">
            <span className="scale_zero_label">0°C</span>
          </span>
        </div>
        <span>+{SCALE_LIMIT}°C</span>
      </div>
      <ChartMeta
        note="Anomalies are the annual mean temperature of each country minus its 1951–1980 average, based on CRU TS 4.10 data. Hover over the chart to see the values for each country."
        source={
          <>
            UN Trade and Development (UNCTAD), based on data from the{' '}
            <a href="https://climateknowledgeportal.worldbank.org/download-data" rel="noreferrer" target="_blank">
              World Bank
            </a>
            .
          </>
        }
      />
      {tooltip && tooltipTemp !== null && tooltipTemp !== undefined && (
        <div className={`tooltip${tooltip.left > (figureRef.current?.clientWidth ?? 0) / 2 ? ' tooltip_left' : ''}`} style={{ left: tooltip.left, top: tooltip.top }}>
          {countries[tooltip.id] || tooltip.id}: {tooltipTemp > 0 ? '+' : ''}
          {tooltipTemp.toFixed(1)}°C
        </div>
      )}
    </figure>
  );
};

export default SunBurst;
