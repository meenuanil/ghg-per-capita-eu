// ----------------------
// CHART SETUP
// ----------------------

const nameMap = {
  "Czech Republic": "Czechia",
  "Republic of Ireland": "Ireland",
  "The Netherlands": "Netherlands",
  "Slovak Republic": "Slovakia",
  "French Republic": "France"
};

let ghgTimeSeries = {};
let years = [];
let chart;

fetch('annual-co2-emissions-per-country_updated.csv')
  .then(r => r.text())
  .then(text => {
    const rows = text.trim().split('\n').map(r => r.split(','));
    const header = rows[0];
    years = rows.slice(1).map(r => +r[0]);

    for (let c = 1; c < header.length; c++) {
      const country = header[c];
      ghgTimeSeries[country] = rows.slice(1).map(r => +r[c]);
    }

    drawDefaultChart();
  });

function drawDefaultChart() {
  const countries = Object.keys(ghgTimeSeries);
  const values2021 = countries.map(c => {
    const arr = ghgTimeSeries[c];
    return arr[arr.length - 1];
  });

  if (chart) chart.destroy();

  const ctx = document.getElementById('ghgChart').getContext('2d');

  chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: countries,
      datasets: [{
        label: "2021 CO₂ Emissions",
        data: values2021,
        backgroundColor: '#0868AC'
      }]
    },
    options: {
      responsive: true,
      scales: {
        x: { ticks: { display: false } },
        y: { title: { display: true, text: 'CO₂ (tons)' } }
      }
    }
  });

  document.getElementById("chart-title").innerText = "Europe CO₂ Emissions (2021)";
}

function updateChart(countryName) {
  const csvName = nameMap[countryName] || countryName;
  const values = ghgTimeSeries[csvName];
  if (!values) return;

  if (chart) chart.destroy();

  const ctx = document.getElementById('ghgChart').getContext('2d');

  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: years,
      datasets: [{
        label: csvName + " CO₂ Emissions",
        data: values,
        borderColor: '#0868AC',
        backgroundColor: 'rgba(8,104,172,0.2)',
        borderWidth: 2,
        pointRadius: 2
      }]
    },
    options: {
      responsive: true,
      scales: {
        x: { title: { display: true, text: 'Year' } },
        y: { title: { display: true, text: 'CO₂ (tons)' } }
      }
    }
  });

  document.getElementById("chart-title").innerText = csvName + " CO₂ Emissions (2010–2021)";
}

// ----------------------
// MAP SETUP
// ----------------------

const map = L.map('map', {
  center: [56.5, 13.0550],
  zoom: 4,
  minZoom: 3,
  maxZoom: 10
});

// English greyscale basemap
L.tileLayer(
  "https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO"
  }
).addTo(map);

// Pane for Luxembourg callout
map.createPane("luxPane");
map.getPane("luxPane").style.zIndex = 700;

// Pane for population symbols
map.createPane("popPane");
map.getPane("popPane").style.zIndex = 650;
map.getPane("popPane").style.pointerEvents = "none";

// ----------------------
// DATA STRUCTURES
// ----------------------

let ghgLookup = {};
let geojson;
let luxArrow;
let luxBox;

// ----------------------
// LOAD GHG GEOJSON
// ----------------------

fetch('GHG_POP.geojson')
  .then(r => r.json())
  .then(ghgData => {

    ghgData.features.forEach(f => {
      const iso3 = f.properties.ISO3_CODE;
      ghgLookup[iso3] = {
        ghg: f.properties.GHG_Per_Ca,
        pop: f.properties.Population,
        country: f.properties.Country
      };
    });

    geojson = L.geoJson(ghgData, {
      style: styleChoro,

      onEachFeature: function (feature, layer) {
        const name = feature.properties.Country;
        const ghg = feature.properties.GHG_Per_Ca;
        const pop = feature.properties.Population.toLocaleString();

        const popupHTML = `
          <div class="popup-title">${name}</div>
          <div class="popup-row"><b>GHG per capita:</b> ${ghg}</div>
          <div class="popup-row"><b>Population:</b> ${pop}</div>
        `;

        layer.bindPopup(popupHTML, { autoPan: false });

        layer.on({
          mouseover: highlightFeature,
          mouseout: resetHighlight,
          click: () => {
            layer.openPopup();
            const csvName = nameMap[name] || name;
            updateChart(csvName);
          }
        });
      }
    }).addTo(map);

    const lux = ghgData.features.find(f => f.properties.ISO3_CODE === "LUX");

    if (lux) {
      const bounds = L.geoJson(lux).getBounds();
      const center = bounds.getCenter();

      luxArrow = L.polyline(
        [
          [center.lat, center.lng],
          [53.5, center.lng + 22]
        ],
        {
          pane: "luxPane",
          color: "#2A5C6A",
          weight: 2,
          dashArray: "4,4",
          interactive: false
        }
      ).addTo(map);

      luxBox = L.rectangle(bounds.pad(0.5), {
        pane: "luxPane",
        color: "#2A5C6A",
        weight: 1.2,
        fillOpacity: 0,
        interactive: false
      }).addTo(map);
    }
  });

// ----------------------
// POPULATION SYMBOLS
// ----------------------

// ----------------------
// POPULATION SYMBOLS (USE USER DATA, FIX FRANCE, NO POPUPS)
// ----------------------
// ----------------------
// POPULATION SYMBOLS (USE USER DATA, FIX FRANCE, NO POPUPS)
// ----------------------
fetch("Pop_Symbol.geojson")
  .then(r => r.json())
  .then(popData => {

    const maxPop = Math.max(
      ...popData.features.map(f => f.properties.Population)
    );

    popData.features.forEach(f => {
      const country = f.properties.NAME_ENGL;
      const pop = f.properties.Population;

      // Skip the WRONG France point (inside Spain)
      if (country === "France") return;

      // Skip the wrong France point mislabeled as Spain
      // Spain correct centroid ≈ -3.7, 40.2
      // Wrong France point ≈ -7.35, 42.86
      if (country === "Spain" && f.geometry.coordinates[0] < -6) return;

      let lat, lng;

      if (f.geometry.type === "Point") {
        [lng, lat] = f.geometry.coordinates;
      } else {
        const bounds = L.geoJson(f).getBounds();
        const center = bounds.getCenter();
        lat = center.lat;
        lng = center.lng;
      }

      const radius = (Math.sqrt(pop) / Math.sqrt(maxPop)) * 30;

      L.circleMarker([lat, lng], {
        radius: radius,
        color: "#3F7E44",
        weight: 1,
        fillColor: "#3F7E44",
        fillOpacity: 0.55,
        pane: "popPane",
        interactive: false
      }).addTo(map);
    });

    // ----------------------
    // ADD CORRECT FRANCE CENTROID MANUALLY
    // ----------------------
    const franceLat = 46.603354;   // Correct mainland France centroid
    const franceLng = 1.888334;

    const francePop = 67842811; // from your data
    const franceRadius = (Math.sqrt(francePop) / Math.sqrt(maxPop)) * 30;

    L.circleMarker([franceLat, franceLng], {
      radius: franceRadius,
      color: "#3F7E44",
      weight: 1,
      fillColor: "#3F7E44",
      fillOpacity: 0.55,
      pane: "popPane",
      interactive: false
    }).addTo(map);
  });
// ----------------------
// CHOROPLETH STYLE
// ----------------------

function styleChoro(feature) {
  const v = feature.properties.GHG_Per_Ca;

  if (v <= 5.69) return { color: '#232323', weight: 1, fillOpacity: 1, fillColor: '#F0F9E8' };
  if (v <= 7.77) return { color: '#232323', weight: 1, fillOpacity: 1, fillColor: '#BAE4BC' };
  if (v <= 9.58) return { color: '#232323', weight: 1, fillOpacity: 1, fillColor: '#7BCCC4' };
  if (v <= 12.15) return { color: '#232323', weight: 1, fillOpacity: 1, fillColor: '#43A2CA' };
  return { color: '#232323', weight: 1, fillOpacity: 1, fillColor: '#0868AC' };
}

function highlightFeature(e) {
  const layer = e.target;
  layer.setStyle({
    weight: 3,
    color: '#ffcc00',
    fillColor: '#ffe680',
    fillOpacity: 0.9
  });
  layer.bringToFront();
}

function resetHighlight(e) {
  geojson.resetStyle(e.target);
}
