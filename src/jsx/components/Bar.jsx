import LoadFile from '@unctad-infovis/general-tools/helpers/LoadFile.js';
import roundNr from '@unctad-infovis/general-tools/helpers/RoundNr.js';
import useIsVisible from '@unctad-infovis/general-tools/helpers/UseIsVisible.js';
import chroma from 'chroma-js';
import * as d3 from 'd3';
import { useEffect, useRef, useState } from 'react';

import ChartHeader from './shared/ChartHeader.jsx';
import ChartMeta from './shared/ChartMeta.jsx';

import './Bar.css';

// Inspiration for the bar chart: https://twitter.com/ScottDuncanWX/status/1417930383929352199

const MARGIN = { bottom: 40, left: 60, top: 40 };
const SCALE_LIMIT = 1.5;
const Y_TICKS = [-0.5, 0, 0.5, 1, 1.5];
const START_DELAY = 1000;

// Milliseconds per year, can be overridden with #speed=50 in the url.
const speed = Number.parseInt(new URLSearchParams(window.location.hash.slice(1)).get('speed'), 10) || 100;
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// https://gka.github.io/chroma.js/
const colorScale = chroma.scale('RdYlBu').domain([SCALE_LIMIT, 0, -SCALE_LIMIT]);
const textColorScale = chroma.scale(['red', 'rgba(0, 0, 0, 0.3)', 'blue']).padding(-1).domain([SCALE_LIMIT, 0, -SCALE_LIMIT]);

const Bar = () => {
  const wrapperRef = useRef(null);
  const [setChartNode, isVisible, chartNode] = useIsVisible(0.3);

  const [years, setYears] = useState(null);
  const [values, setValues] = useState(null);
  const [curYear, setCurYear] = useState(null);
  const [isFinished, setIsFinished] = useState(false);
  const [size, setSize] = useState({ height: 0, width: 0 });
  const [hover, setHover] = useState(null);

  useEffect(() => {
    let cancelled = false;
    LoadFile('assets/data/global_temperature.json')
      .then(response => response?.json())
      .then(json => {
        if (cancelled || !json) return;
        const entries = Object.entries(json).sort(([a], [b]) => a - b);
        const yearList = entries.map(([year]) => Number(year));
        setYears(yearList);
        setValues(entries.map(([, value]) => value));
        setCurYear(yearList[0]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!chartNode) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ height: entry.contentRect.height, width: entry.contentRect.width });
    });
    observer.observe(chartNode);
    return () => observer.disconnect();
  }, [chartNode]);

  const startYear = years?.[0];
  const endYear = years?.[years.length - 1];

  // Grow the chart one year at a time once it has scrolled into view.
  useEffect(() => {
    if (!values || !isVisible || isFinished) return;
    if (prefersReducedMotion()) {
      setCurYear(endYear);
      setIsFinished(true);
      return;
    }
    let interval;
    const timeout = setTimeout(() => {
      interval = setInterval(() => setCurYear(year => Math.min(year + 1, endYear)), speed);
    }, START_DELAY);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [endYear, isFinished, isVisible, values]);

  useEffect(() => {
    if (endYear && curYear >= endYear) setIsFinished(true);
  }, [curYear, endYear]);

  const restartAnimation = () => {
    setCurYear(startYear);
    setIsFinished(false);
  };

  const innerWidth = Math.max(0, size.width - MARGIN.left);
  const innerHeight = Math.max(0, size.height - MARGIN.top - MARGIN.bottom);
  const visibleValues = values && curYear !== null ? values.slice(0, curYear - startYear + 1) : [];
  const currentTemp = visibleValues.length ? visibleValues[visibleValues.length - 1] : 0;

  // The scales follow the data that is visible so far, so the chart rescales while it grows.
  const x = d3
    .scaleBand()
    .domain(visibleValues.map((_, i) => i))
    .range([0, innerWidth]);
  const y = d3
    .scaleLinear()
    .domain([Math.max(0.15, d3.max(visibleValues) ?? 0), Math.min(-0.3, d3.min(visibleValues) ?? 0)])
    .range([0, innerHeight]);
  const ticks = Y_TICKS.filter(tick => tick <= y.domain()[0] && tick >= y.domain()[1]);

  const showTooltip = (event, index) => {
    const rect = wrapperRef.current.getBoundingClientRect();
    setHover({ index, left: event.clientX - rect.left, top: event.clientY - rect.top });
  };

  return (
    <figure className="container_bar">
      <ChartHeader subtitle={`Annual global mean temperature anomalies relative to a pre-industrial (1850–1900) baseline, °C, ${startYear ?? ''}–${endYear ?? ''}`} title="Global heating pushes temperatures into danger zone" />
      <div className="chart_wrapper" ref={wrapperRef}>
        {isFinished && !prefersReducedMotion() && (
          <button className="restart_button" onClick={restartAnimation} type="button">
            Restart animation
          </button>
        )}
        <div className="chart_container" ref={setChartNode}>
          {values && size.width > 0 && (
            <svg aria-label={`Bar chart of the annual global mean temperature anomaly from ${startYear} to ${endYear}. The anomaly has risen from ${roundNr({ d: 2, x: values[0] })}°C to ${roundNr({ d: 2, x: values[values.length - 1] })}°C.`} height={size.height} role="img" width={size.width}>
              <g className="yaxis" transform={`translate(${MARGIN.left - 1}, ${MARGIN.top})`}>
                {ticks.map(tick => (
                  <g className={tick === 0 ? 'tick tick_zero' : 'tick'} key={tick} transform={`translate(0, ${y(tick)})`}>
                    <line x2={innerWidth + 1} />
                    <text dy="0.32em" textAnchor="end" x={-9}>
                      {tick}°C
                    </text>
                  </g>
                ))}
              </g>
              <g className="bars" transform={`translate(${MARGIN.left}, ${MARGIN.top})`}>
                {visibleValues.map((value, i) => (
                  <rect fill={colorScale(value).hex()} height={Math.abs(y(value) - y(0))} key={years[i]} onPointerLeave={() => setHover(null)} onPointerMove={event => showTooltip(event, i)} width={x.bandwidth()} x={x(i)} y={value > 0 ? y(value) : y(0) + 1} />
                ))}
              </g>
            </svg>
          )}
        </div>
        <div aria-hidden="true" className="info_container">
          <div className="year_container">{curYear}</div>
          <div className="temp_container" style={{ color: textColorScale(currentTemp).hex() }}>
            {currentTemp > 0 ? '+' : ''}
            {roundNr({ d: 2, x: currentTemp })}°C
          </div>
        </div>
        {hover && visibleValues[hover.index] !== undefined && (
          <div className={`tooltip${hover.left > size.width / 2 ? ' tooltip_left' : ''}`} style={{ left: hover.left, top: hover.top }}>
            {years[hover.index]}: <b>{visibleValues[hover.index].toFixed(2)}°C</b>
          </div>
        )}
      </div>
      <ChartMeta
        note="The WMO temperature assessment combines eight datasets: ERA5 (ECMWF), JRA-3Q (Japan Meteorological Agency), GISTEMP (NASA), NOAAGlobalTemp (NOAA), HadCRUT5 (UK Met Office and Climatic Research Unit at the University of East Anglia), Berkeley Earth, DCENT and CMST."
        source={
          <>
            UN Trade and Development (UNCTAD), based on data from the{' '}
            <a href="https://wmo.int/publication-series/state-of-global-climate" rel="noreferrer" target="_blank">
              World Meteorological Organization (WMO)
            </a>
            . The annual average is calculated as the average from available data for each year.
          </>
        }
      />
    </figure>
  );
};

export default Bar;
