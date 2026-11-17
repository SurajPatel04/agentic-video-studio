import type {FC} from 'react';
import type {Device3DKind} from '../Device';
import * as PC from './models/computers';
import * as NET from './models/network';
import * as W from './models/world';
import {CarModel} from './models/car';
import * as X from './models/extra';
import type {Look} from './parts';

/**
 * 3D model for every 2D device kind (same names as DEVICE_ICONS in ../Device).
 * Each model is grounded at y = 0, faces +z and is roughly 1.6 units wide.
 */
export const DEVICE_MODELS: Record<Device3DKind, FC<{look: Look}>> = {
  // computers
  computer: PC.ComputerModel,
  laptop: PC.LaptopModel,
  phone: PC.PhoneModel,
  tablet: PC.TabletModel,
  smartwatch: PC.SmartwatchModel,
  // input / output
  mouse: PC.MouseModel,
  keyboard: PC.KeyboardModel,
  monitor: PC.MonitorModel,
  tv: PC.TvModel,
  printer: PC.PrinterModel,
  speaker: X.SpeakerSoundModel,
  headphones: PC.HeadphonesModel,
  webcam: PC.WebcamModel,
  camera: PC.CameraModel,
  microphone: PC.MicrophoneModel,
  gamepad: PC.GamepadModel,
  // network
  router: NET.RouterModel,
  server: NET.ServerModel,
  switch: NET.SwitchModel,
  'access-point': NET.AccessPointModel,
  wifi: NET.WifiModel,
  firewall: NET.FirewallModel,
  security: NET.SecurityModel,
  'load-balancer': NET.LoadBalancerModel,
  'cell-tower': NET.CellTowerModel,
  satellite: NET.SatelliteModel,
  cloud: NET.CloudModel,
  internet: NET.InternetModel,
  database: NET.DatabaseModel,
  'data-center': NET.DataCenterModel,
  // cables / ports
  ethernet: NET.EthernetModel,
  cable: NET.CableModel,
  usb: NET.UsbModel,
  // electronics
  cpu: W.CpuModel,
  ram: W.RamModel,
  storage: W.StorageModel,
  battery: W.BatteryModel,
  charging: W.ChargingModel,
  bulb: W.BulbModel,
  plug: W.PlugModel,
  power: W.PowerModel,
  // places
  house: W.HouseModel,
  building: W.BuildingModel,
  office: W.OfficeModel,
  school: W.SchoolModel,
  hospital: W.HospitalModel,
  factory: W.FactoryModel,
  shop: W.ShopModel,
  // people / other
  user: W.UserModel,
  users: W.UsersModel,
  robot: W.RobotModel,
  car: CarModel,
  drone: W.DroneModel,
  // more network / cables / electronics
  modem: X.ModemModel,
  hub: X.HubModel,
  coaxial: X.CoaxModel,
  fibre: X.FibreModel,
  'undersea-cable': X.UnderseaCableModel,
  isp: X.IspModel,
  resistor: X.ResistorModel,
  capacitor: X.CapacitorModel,
  motherboard: X.MotherboardModel,
  hacker: X.HackerModel,
  lock: X.LockModel,
  magnet: X.MagnetModel,
};

/** Use inside any ThreeCanvas (e.g. your existing 3D scenes). */
export const DeviceModel: FC<{kind: Device3DKind; look: Look}> = ({kind, look}) => {
  const Model = DEVICE_MODELS[kind] ?? PC.MonitorModel;
  return <Model look={look} />;
};
